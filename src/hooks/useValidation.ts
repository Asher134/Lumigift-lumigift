"use client";

import { useState, useCallback } from "react";

/**
 * Tracks which fields have been blurred so errors only show after interaction.
 * Works alongside react-hook-form or manual state forms.
 */
export function useValidation<T extends string>(fields: T[]) {
  const [touched, setTouched] = useState<Partial<Record<T, boolean>>>({});

  const onBlur = useCallback((field: T) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const touchAll = useCallback(() => {
    setTouched(Object.fromEntries(fields.map((f) => [f, true])) as Record<T, boolean>);
  }, [fields]);

  const isTouched = useCallback((field: T) => !!touched[field], [touched]);

  return { onBlur, touchAll, isTouched };
}
