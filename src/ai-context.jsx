import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
const Context = createContext(null);
export function AiProvider({ children }) {
  const [tool, register] = useState(null);
  const value = useMemo(() => ({ tool, register }), [tool]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useAiContext = () => useContext(Context);
export function useAiTool(id, value, setValue, extra = "") {
  const register = useAiContext()?.register;
  useEffect(() => {
    register?.({ id, value, setValue, extra });
    return () => register?.(null);
  }, [register, id, value, setValue, extra]);
}
