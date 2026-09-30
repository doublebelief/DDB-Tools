import React from "react";
export default class LoadBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <section className="empty" role="alert">
          <h2>工具暂时无法打开</h2>
          <p>
            可能是网站已更新或网络连接中断。请先保存当前页面中需要的内容，再刷新重试。
          </p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
          <p>
            <a href="/">返回工具箱</a>
          </p>
        </section>
      );
    return this.props.children;
  }
}
