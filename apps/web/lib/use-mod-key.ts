"use client";

import { formatModShortcut, isMacPlatform, modKeyParts } from "@/lib/mod-key";
import { useEffect, useState } from "react";

export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(isMacPlatform());
  }, []);
  return isMac;
}

export function useModShortcut(key: string): string {
  const isMac = useIsMac();
  return formatModShortcut(key, isMac);
}

export function useModKeyParts(key: string) {
  const isMac = useIsMac();
  return modKeyParts(key, isMac);
}
