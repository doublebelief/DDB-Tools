import { evaluateRegex } from "./regex-engine.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage(evaluateRegex(data));
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
