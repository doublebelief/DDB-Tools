import { webcrypto } from "node:crypto";
import { vi } from "vitest";
Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});
Object.defineProperty(window, "matchMedia", {
  value: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
});
window.scrollTo = () => {};
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
});
HTMLCanvasElement.prototype.getContext = () => ({
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  clearRect() {},
  putImageData() {},
});
HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,test";
const storage = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  },
});

// DOM tests use deterministic workers; real module-worker processing is covered in worker.test.js.
class TestWorker {
  constructor(url) {
    this.url = String(url);
    this.stopped = false;
  }
  async postMessage(data) {
    try {
      const result = this.url.includes("regex.worker")
        ? (await import("../src/regex-engine.js")).evaluateRegex(data)
        : {
            result: (await import("../src/compute-task.js")).computeTask(
              data.type,
              data.args,
            ),
          };
      if (!this.stopped) this.onmessage?.({ data: result });
    } catch (e) {
      if (!this.stopped) this.onmessage?.({ data: { error: e.message } });
    }
  }
  terminate() {
    this.stopped = true;
  }
}
globalThis.Worker = TestWorker;
