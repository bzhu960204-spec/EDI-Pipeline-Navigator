import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkflowStep } from '../../api/workflow';
import { flattenSteps, type IncomingRef } from './workflowUtils';

export type PickerState = { direction: 'next' | 'previous'; index: number } | null;

interface FlowNavigationParams {
  tree: WorkflowStep[];
  selectedId: number | null;
  selectedStep: WorkflowStep | null;
  incomingIndex: Map<number, IncomingRef[]>;
  navigateTo: (stepId: number) => void;
  enabled: boolean;
}

const HANDLED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', 'Home']);

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

/**
 * Keyboard walk over the workflow flow (Tree view). Forward follows transitions (branch picker
 * when many), back retraces the visited-step history (predecessor picker as a fallback), and
 * up/down browse the steps in tree order.
 */
export function useFlowNavigation({
  tree,
  selectedId,
  selectedStep,
  incomingIndex,
  navigateTo,
  enabled,
}: FlowNavigationParams) {
  const [picker, setPicker] = useState<PickerState>(null);
  const historyRef = useRef<number[]>([]);

  // A selection made outside the walk (e.g. clicking another node) cancels a pending pick.
  useEffect(() => {
    setPicker(null);
  }, [selectedId]);

  const go = useCallback(
    (toStepId: number, pushFrom: number | null) => {
      if (pushFrom != null) historyRef.current.push(pushFrom);
      setPicker(null);
      navigateTo(toStepId);
    },
    [navigateTo],
  );

  const forward = useCallback(() => {
    if (!selectedStep) return;
    const nexts = selectedStep.transitions;
    if (picker?.direction === 'next') {
      const chosen = nexts[picker.index];
      if (chosen) go(chosen.toStepId, selectedStep.id);
      return;
    }
    if (nexts.length === 0) return;
    if (nexts.length === 1) {
      go(nexts[0].toStepId, selectedStep.id);
      return;
    }
    setPicker({ direction: 'next', index: 0 });
  }, [selectedStep, picker, go]);

  const back = useCallback(() => {
    if (picker) {
      if (picker.direction === 'previous') {
        const incs = selectedId != null ? incomingIndex.get(selectedId) ?? [] : [];
        const chosen = incs[picker.index];
        if (chosen) go(chosen.fromStep.id, null);
      } else {
        setPicker(null);
      }
      return;
    }
    if (historyRef.current.length > 0) {
      const prev = historyRef.current.pop()!;
      setPicker(null);
      navigateTo(prev);
      return;
    }
    const incs = selectedId != null ? incomingIndex.get(selectedId) ?? [] : [];
    if (incs.length === 0) return;
    if (incs.length === 1) {
      go(incs[0].fromStep.id, null);
      return;
    }
    setPicker({ direction: 'previous', index: 0 });
  }, [picker, selectedId, incomingIndex, navigateTo, go]);

  const move = useCallback(
    (delta: number) => {
      if (picker) {
        const incs = selectedId != null ? incomingIndex.get(selectedId) ?? [] : [];
        const len = picker.direction === 'next' ? selectedStep?.transitions.length ?? 0 : incs.length;
        if (len === 0) return;
        setPicker({ direction: picker.direction, index: (picker.index + delta + len) % len });
        return;
      }
      const flat = flattenSteps(tree);
      if (flat.length === 0) return;
      const idx = flat.findIndex((s) => s.id === selectedId);
      if (idx === -1) {
        navigateTo(flat[0].id);
        return;
      }
      const target = flat[idx + delta];
      if (target) navigateTo(target.id);
    },
    [picker, selectedStep, selectedId, incomingIndex, tree, navigateTo],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled || isTypingTarget(e.target) || !HANDLED_KEYS.has(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      switch (e.key) {
        case 'ArrowRight':
        case 'Enter':
          forward();
          break;
        case 'ArrowLeft':
        case 'Backspace':
          back();
          break;
        case 'ArrowDown':
          move(1);
          break;
        case 'ArrowUp':
          move(-1);
          break;
        case 'Home':
          if (tree[0]) {
            historyRef.current = [];
            setPicker(null);
            navigateTo(tree[0].id);
          }
          break;
        case 'Escape':
          setPicker(null);
          break;
      }
    },
    [enabled, forward, back, move, tree, navigateTo],
  );

  return { picker, onKeyDown };
}
