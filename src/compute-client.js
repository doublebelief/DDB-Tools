import { useCallback, useEffect, useRef } from "react";
export function compute(type, args, { signal, timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("处理已取消", "AbortError"));
      return;
    }
    let worker, timer;
    const finish = (error, result) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker?.terminate();
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(new DOMException("处理已取消", "AbortError"));
    try {
      worker = new Worker(new URL("./compute.worker.js", import.meta.url), {
        type: "module",
      });
      timer = setTimeout(
        () => finish(new Error("处理超过 5 秒，已中止。请缩短输入后重试")),
        timeout,
      );
      signal?.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }) =>
        finish(data.error ? new Error(data.error) : null, data.result);
      worker.onerror = () =>
        finish(
          new Error(
            "处理线程加载失败，请重试；若刚更新过网站，请保存输入后刷新",
          ),
        );
      worker.postMessage({ type, args });
    } catch (e) {
      finish(e);
    }
  });
}
export function useCompute() {
  const controller = useRef();
  useEffect(() => () => controller.current?.abort(), []);
  return useCallback((type, args) => {
    controller.current?.abort();
    controller.current = new AbortController();
    return compute(type, args, { signal: controller.current.signal });
  }, []);
}
