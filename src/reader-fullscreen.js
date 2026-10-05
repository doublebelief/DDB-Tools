import { useCallback, useEffect, useRef, useState } from "react";
export function useReaderFullscreen(reader) {
  const [fullscreen, setFullscreen] = useState(false);
  const wanted = useRef(false),
    native = useRef(false),
    generation = useRef(0),
    owned = useRef(null);
  const exitNative = useCallback(() => {
    if (
      owned.current &&
      document.fullscreenElement === owned.current &&
      document.exitFullscreen
    ) {
      try {
        Promise.resolve(document.exitFullscreen()).catch(() => {});
      } catch {}
    }
  }, []);
  const leave = useCallback(() => {
    generation.current++;
    wanted.current = false;
    native.current = false;
    setFullscreen(false);
    exitNative();
  }, [exitNative]);
  async function toggle() {
    if (wanted.current) return leave();
    const element = reader.current;
    if (!element) return;
    const version = ++generation.current;
    owned.current = element;
    wanted.current = true;
    setFullscreen(true);
    if (element.requestFullscreen && document.fullscreenEnabled !== false) {
      try {
        await element.requestFullscreen();
        // An exit, logout or unmount may have happened during the browser prompt.
        if (
          (version !== generation.current && !wanted.current) ||
          !element.isConnected
        )
          exitNative();
      } catch {
        /* Keep the in-page reading mode when native fullscreen is unavailable. */
      }
    }
  }
  useEffect(() => {
    const changed = () => {
      if (owned.current && document.fullscreenElement === owned.current)
        native.current = true;
      else if (native.current) {
        native.current = false;
        wanted.current = false;
        generation.current++;
        setFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", changed);
    return () => {
      generation.current++;
      wanted.current = false;
      exitNative();
      document.removeEventListener("fullscreenchange", changed);
    };
  }, [exitNative]);
  useEffect(() => {
    if (!fullscreen || !reader.current) return;
    const element = reader.current,
      overflow = document.body.style.overflow;
    const background = [];
    for (
      let node = element;
      node && node !== document.body;
      node = node.parentElement
    ) {
      for (const sibling of node.parentElement?.children || []) {
        if (sibling !== node) {
          background.push([sibling, sibling.hasAttribute("inert")]);
          sibling.setAttribute("inert", "");
        }
      }
    }
    document.body.style.overflow = "hidden";
    element.querySelector("[data-fullscreen-toggle]")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      for (const [node, wasInert] of background)
        if (!wasInert) node.removeAttribute("inert");
      if (element.isConnected)
        element.querySelector("[data-fullscreen-toggle]")?.focus();
    };
  }, [fullscreen, reader]);
  function onKeyDown(event) {
    if (!fullscreen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      leave();
    }
    if (event.key !== "Tab") return;
    const nodes = [
      ...reader.current.querySelectorAll(
        'button:not(:disabled),select:not(:disabled),[tabindex="0"]',
      ),
    ];
    if (event.shiftKey && document.activeElement === nodes[0]) {
      event.preventDefault();
      nodes.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
      event.preventDefault();
      nodes[0]?.focus();
    }
  }
  return { fullscreen, toggle, leave, onKeyDown };
}
