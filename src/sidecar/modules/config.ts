import { getConfigValue, setConfigValue } from "@intisy-ai/core";
import { wrap } from "../result.js";

export const configGet = (name: string, key: string) => wrap(() => getConfigValue(name, key));
export const configSet = (name: string, key: string, value: unknown) =>
  wrap(() => {
    setConfigValue(name, key, value);
  });
