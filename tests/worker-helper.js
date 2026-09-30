import { Worker } from "node:worker_threads";
export function runWorker(file, data, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const {parentPort}=require('node:worker_threads');global.self=global;global.postMessage=x=>parentPort.postMessage(x);const ready=import(${JSON.stringify(file.href)});parentPort.on('message',async data=>{await ready;self.onmessage({data});});`,
      { eval: true },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("timeout"));
    }, timeout);
    worker.on("message", (v) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(v);
    });
    worker.on("error", (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(e);
    });
    worker.postMessage(data);
  });
}
