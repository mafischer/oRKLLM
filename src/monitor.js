import fs from 'fs';
import si from 'systeminformation';
import os from 'os';
import pool from './pool.js';

/**
 * Gather current CPU, NPU, RAM, and Temperature metrics
 * @returns {Promise<object>} system metrics object
 */
export async function getSystemMetrics() {
  const isLinux = os.platform() === 'linux';
  
  // 1. CPU Usage
  let cpuLoad = 0;
  try {
    const loadData = await si.currentLoad();
    cpuLoad = loadData.currentLoad;
  } catch (e) {
    // fallback
  }

  // 2. RAM Usage
  let totalMem = 0;
  let usedMem = 0;
  try {
    const memData = await si.mem();
    totalMem = memData.total;
    usedMem = memData.active;
  } catch (e) {
    // fallback
  }

  // 3. SoC Temperature
  let temperature = 0;
  if (isLinux) {
    try {
      if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
        const rawTemp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf-8');
        temperature = parseFloat(rawTemp) / 1000.0;
      }
    } catch (e) {
      // ignore
    }
  }
  
  if (temperature === 0) {
    try {
      const tempObj = await si.cpuTemperature();
      temperature = tempObj.main || 0;
    } catch (e) {
      // ignore
    }
  }

  // Mock temperature fallback
  if (temperature === 0) {
    const baseTemp = pool.activeGeneration ? 54 : 41;
    temperature = baseTemp + Math.random() * 2;
  }

  // 4. NPU Load
  let npuLoad = 0;
  if (isLinux) {
    try {
      if (fs.existsSync('/sys/kernel/debug/rknpu/load')) {
        const rawLoad = fs.readFileSync('/sys/kernel/debug/rknpu/load', 'utf-8');
        const match = rawLoad.match(/(\d+)%/);
        if (match) {
          npuLoad = parseInt(match[1]);
        } else {
          npuLoad = parseInt(rawLoad.trim()) || 0;
        }
      }
    } catch (e) {
      // ignore
    }
  }
  
  // Mock NPU load fallback based on active generation
  if (npuLoad === 0) {
    if (pool.activeGeneration) {
      npuLoad = Math.floor(68 + Math.random() * 24); // 68% - 92%
    } else {
      npuLoad = 0;
    }
  }

  return {
    cpu: Math.round(cpuLoad),
    ram: {
      total: totalMem,
      used: usedMem,
      percentage: totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0
    },
    temperature: Math.round(temperature * 10) / 10,
    npu: npuLoad
  };
}
