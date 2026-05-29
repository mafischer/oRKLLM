import crypto from 'crypto';
import {
  dbGetAuthProviderConfig,
  dbGetUserBySubject, dbGetUserById, dbCreateUser, dbUpdateUser,
  dbLogAudit,
} from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { issueSessionCookie } from './session.js';

function logAudit(req, user, action) {
  try {
    dbLogAudit({
      id: uuidv4(),
      userId: user?.id ?? null,
      username: user?.username ?? 'anonymous',
      action,
      resource: null,
      ipAddress: req.ip ?? null,
    });
  } catch (e) {}
}

export default async function authRoutes(fastify, options) {

  // ── OIDC ──────────────────────────────────────────────────────────────────

  fastify.get('/oidc/authorize', async (request, reply) => {
    const cfg = dbGetAuthProviderConfig();
    if (cfg?.providerType !== 'oidc') return reply.status(400).send({ error: 'OIDC not configured' });
    const c = cfg.config;

    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');

    const isPublicClient = !c.clientSecret;
    let codeVerifier = null;
    let codeChallenge = null;
    if (isPublicClient) {
      codeVerifier = crypto.randomBytes(32).toString('base64url');
      codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      reply.setCookie('oidc_cv', codeVerifier, { path: '/', httpOnly: true, maxAge: 600 });
    }

    reply.setCookie('oidc_state', state, { path: '/', httpOnly: true, maxAge: 600 });
    reply.setCookie('oidc_nonce', nonce,  { path: '/', httpOnly: true, maxAge: 600 });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      scope: 'openid profile email',
      state,
      nonce,
    });
    if (isPublicClient) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    try {
      const { Issuer } = await import('openid-client');
      const issuer = await Issuer.discover(c.issuer);
      return reply.redirect(`${issuer.authorization_endpoint}?${params}`);
    } catch {
      const authUrl = `${c.issuer.replace(/\/$/, '')}/protocol/openid-connect/auth?${params}`;
      return reply.redirect(authUrl);
    }
  });

  fastify.get('/oidc/callback', async (request, reply) => {
    const cfg = dbGetAuthProviderConfig();
    if (cfg?.providerType !== 'oidc') return reply.status(400).send({ error: 'OIDC not configured' });
    const c = cfg.config;

    const { code, state, error: oidcError } = request.query;
    if (oidcError) return reply.redirect(`/?oidc_error=${encodeURIComponent(oidcError)}`);

    const storedState = request.cookies.oidc_state;
    if (!storedState || storedState !== state) return reply.status(400).send({ error: 'Invalid state parameter' });

    const isPublicClient = !c.clientSecret;
    const codeVerifier = request.cookies.oidc_cv;

    let tokenData;
    try {
      const { Issuer } = await import('openid-client');
      const issuer = await Issuer.discover(c.issuer);

      const clientConfig = isPublicClient
        ? { client_id: c.clientId, token_endpoint_auth_method: 'none' }
        : { client_id: c.clientId, client_secret: c.clientSecret };

      const client = new issuer.Client(clientConfig);
      const checks = { state, nonce: request.cookies.oidc_nonce };
      if (isPublicClient && codeVerifier) checks.code_verifier = codeVerifier;

      const tokenSet = await client.callback(c.redirectUri, { code, state }, checks);
      tokenData = tokenSet.claims();
    } catch (e) {
      console.error('[OIDC] Token exchange failed:', e.message);
      return reply.redirect(`/?oidc_error=${encodeURIComponent('Authentication failed: ' + e.message)}`);
    }

    const subject = tokenData.sub;
    const username = tokenData[c.usernameClaim || 'preferred_username'] || tokenData.email || subject;
    const email = tokenData[c.emailClaim || 'email'] || null;
    const groups = tokenData[c.groupsClaim || 'groups'] || [];

    let role = c.defaultRole || 'user';
    for (const mapping of (c.groupRoleMap || [])) {
      if (groups.includes(mapping.group)) { role = mapping.role; break; }
    }

    let user = dbGetUserBySubject('oidc', subject);
    if (!user) {
      if (!c.autoProvision) return reply.redirect(`/?oidc_error=${encodeURIComponent('User not provisioned. Contact your administrator.')}`);
      const id = uuidv4();
      dbCreateUser({ id, username, email, role, authProvider: 'oidc', authSubject: subject, passwordHash: null, passwordSalt: null });
      user = dbGetUserById(id);
    } else {
      dbUpdateUser(user.id, { last_login_at: Date.now(), email: email ?? user.email });
    }

    issueSessionCookie(reply, { id: user.id, username: user.username, role: user.role });
    logAudit(request, { id: user.id, username: user.username }, 'oidc_login');
    reply.clearCookie('oidc_state').clearCookie('oidc_nonce').clearCookie('oidc_cv');
    return reply.redirect('/');
  });

  // ── SAML ──────────────────────────────────────────────────────────────────

  fastify.get('/saml/metadata', async (request, reply) => {
    const cfg = dbGetAuthProviderConfig();
    if (cfg?.providerType !== 'saml') return reply.status(400).send({ error: 'SAML not configured' });

    const baseUrl = `${request.protocol}://${request.hostname}`;
    const entityId = `${baseUrl}/auth/saml/metadata`;
    const acsUrl   = `${baseUrl}/auth/saml/acs`;

    const xml = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"
                   AuthnRequestsSigned="false" WantAssertionsSigned="true">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                              Location="${acsUrl}" index="0"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
    reply.header('Content-Type', 'application/xml');
    return xml;
  });

  fastify.get('/saml/login', async (request, reply) => {
    const cfg = dbGetAuthProviderConfig();
    if (cfg?.providerType !== 'saml') return reply.status(400).send({ error: 'SAML not configured' });
    const c = cfg.config;
    const base = `${request.protocol}://${request.hostname}`;

    try {
      const samlify = await import('samlify');
      const sp = samlify.ServiceProvider({
        entityID: `${base}/auth/saml/metadata`,
        assertionConsumerService: [{ Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST', Location: `${base}/auth/saml/acs` }],
      });
      const idp = samlify.IdentityProvider({ metadata: c.idpMetadataXml });
      const { context } = sp.createLoginRequest(idp, 'redirect');
      return reply.redirect(context);
    } catch (e) {
      console.error('[SAML] Login request failed:', e.message);
      return reply.status(500).send({ error: 'SAML login failed' });
    }
  });

  fastify.post('/saml/acs', async (request, reply) => {
    const cfg = dbGetAuthProviderConfig();
    if (cfg?.providerType !== 'saml') return reply.status(400).send({ error: 'SAML not configured' });
    const c = cfg.config;
    const base = `${request.protocol}://${request.hostname}`;

    let samlUser;
    try {
      const samlify = await import('samlify');
      samlify.setSchemaValidator({ validate: () => Promise.resolve('skipped') });
      const sp = samlify.ServiceProvider({
        entityID: `${base}/auth/saml/metadata`,
        assertionConsumerService: [{ Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST', Location: `${base}/auth/saml/acs` }],
      });
      const idp = samlify.IdentityProvider({ metadata: c.idpMetadataXml });
      const { extract } = await sp.parseLoginResponse(idp, 'post', { body: request.body });
      samlUser = extract;
    } catch (e) {
      console.error('[SAML] ACS parse failed:', e.message);
      return reply.redirect(`/?saml_error=${encodeURIComponent('SAML authentication failed')}`);
    }

    const nameId = samlUser.nameID || samlUser.nameId;
    const attrs = samlUser.attributes || {};
    const username = attrs[c.samlUsernamePath || 'uid']?.[0] || nameId;
    const email    = attrs[c.samlEmailPath  || 'email']?.[0]  || null;
    const groups   = attrs[c.samlGroupsPath || 'groups']       || [];

    let role = c.defaultRole || 'user';
    for (const mapping of (c.groupRoleMap || [])) {
      if (groups.includes(mapping.group)) { role = mapping.role; break; }
    }

    let user = dbGetUserBySubject('saml', nameId);
    if (!user) {
      if (!c.autoProvision) return reply.redirect(`/?saml_error=${encodeURIComponent('User not provisioned. Contact your administrator.')}`);
      const id = uuidv4();
      dbCreateUser({ id, username, email, role, authProvider: 'saml', authSubject: nameId, passwordHash: null, passwordSalt: null });
      user = dbGetUserById(id);
    } else {
      dbUpdateUser(user.id, { last_login_at: Date.now(), email: email ?? user.email });
    }

    issueSessionCookie(reply, { id: user.id, username: user.username, role: user.role });
    logAudit(request, { id: user.id, username: user.username }, 'saml_login');
    return reply.redirect('/');
  });
}
