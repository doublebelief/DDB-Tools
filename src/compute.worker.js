import { computeTask } from "./compute-task.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: computeTask(data.type, data.args) });
  } catch (e) {
    self.postMessage({ error: e.message || "处理失败" });
  }
};
