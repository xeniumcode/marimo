/* Copyright 2024 Marimo. All rights reserved. */
import {
  acceptCompletion,
  closeBrackets,
  closeBracketsKeymap,
  startCompletion,
  moveCompletionSelection,
  completionStatus,
} from "@codemirror/autocomplete";
import {
  history,
  historyKeymap,
  indentWithTab,
  indentMore,
} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  keymap,
  rectangularSelection,
  tooltips,
  EditorView,
} from "@codemirror/view";

import { EditorState, type Extension, Prec } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";

import type { CompletionConfig, KeymapConfig } from "../config/config-schema";
import type { Theme } from "../../theme/useTheme";

import { findReplaceBundle } from "./find-replace/extension";
import {
  type CodeCallbacks,
  type MovementCallbacks,
  cellCodeEditingBundle,
  cellMovementBundle,
} from "./cells/extensions";
import type { CellId } from "../cells/ids";
import { keymapBundle } from "./keymaps/keymaps";
import { scrollActiveLineIntoView } from "./extensions";
import { copilotBundle } from "./copilot/extension";
import { hintTooltip } from "./completion/hints";
import { adaptiveLanguageConfiguration } from "./language/extension";
import { historyCompartment } from "./editing/extensions";
import { goToDefinitionBundle } from "./go-to-definition/extension";
import type { HotkeyProvider } from "../hotkeys/hotkeys";
import { lightTheme } from "./theme/light";
import { dndBundle } from "./misc/dnd";
import { jupyterHelpExtension } from "./compat/jupyter";
import { pasteBundle } from "./misc/paste";

export interface CodeMirrorSetupOpts {
  cellId: CellId;
  showPlaceholder: boolean;
  enableAI: boolean;
  cellMovementCallbacks: MovementCallbacks;
  cellCodeCallbacks: CodeCallbacks;
  completionConfig: CompletionConfig;
  keymapConfig: KeymapConfig;
  theme: Theme;
  hotkeys: HotkeyProvider;
}

/**
 * Setup CodeMirror for a cell
 */
export const setupCodeMirror = (opts: CodeMirrorSetupOpts): Extension[] => {
  const {
    cellId,
    cellMovementCallbacks,
    cellCodeCallbacks,
    keymapConfig,
    hotkeys,
  } = opts;

  return [
    // Editor keymaps (vim or defaults) based on user config
    keymapBundle(keymapConfig, cellMovementCallbacks),
    dndBundle(),
    pasteBundle(),
    jupyterHelpExtension(),
    // Cell editing
    cellMovementBundle(cellId, cellMovementCallbacks, hotkeys),
    cellCodeEditingBundle(cellId, cellCodeCallbacks, hotkeys),
    // Comes last so that it can be overridden
    basicBundle(opts),
    // Underline cmd+clickable placeholder
    goToDefinitionBundle(),
  ];
};

const startCompletionAtEndOfLine = (cm: EditorView): boolean => {
  const { from, to } = cm.state.selection.main;
  if (from !== to) {
    // this is a selection
    return false;
  }

  const line = cm.state.doc.lineAt(to);
  return line.text.slice(0, to - line.from).trim() === ""
    ? // in the whitespace prefix of a line
      false
    : startCompletion(cm);
};

// Based on codemirror's basicSetup extension
export const basicBundle = (opts: CodeMirrorSetupOpts): Extension[] => {
  const { theme, hotkeys, completionConfig } = opts;

  return [
    ///// View
    EditorView.lineWrapping,
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    lineNumbers(),
    rectangularSelection(),
    tooltips({
      // Having fixed position prevents tooltips from being repositioned
      // and bouncing distractingly
      position: "fixed",
      // This the z-index multiple tooltips being stacked
      // For example, if we have a hover tooltip and a completion tooltip
      parent: document.querySelector<HTMLElement>("#App") ?? undefined,
    }),
    scrollActiveLineIntoView(),
    theme === "dark" ? oneDark : lightTheme,

    hintTooltip(),
    copilotBundle(completionConfig),
    foldGutter(),
    closeBrackets(),
    // to avoid clash with charDeleteBackward keymap
    Prec.high(keymap.of(closeBracketsKeymap)),
    bracketMatching(),
    indentOnInput(),
    indentUnit.of("    "),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of(foldKeymap),

    ///// Language Support
    adaptiveLanguageConfiguration(opts),

    ///// Editing
    historyCompartment.of(history()),
    EditorState.allowMultipleSelections.of(true),
    findReplaceBundle(hotkeys),
    keymap.of([
      {
        key: "Tab",
        run: (cm) => {
          return (
            acceptCompletion(cm) ||
            startCompletionAtEndOfLine(cm) ||
            indentMore(cm)
          );
        },
        preventDefault: true,
      },
      {
        key: "Alt-j",
        mac: "Ctrl-j",
        run: (cm) => {
          if (completionStatus(cm.state) !== null) {
            moveCompletionSelection(true)(cm);
            return true;
          }
          return false;
        },
        preventDefault: true,
      },
      {
        key: "Alt-k",
        mac: "Ctrl-k",
        run: (cm) => {
          if (completionStatus(cm.state) !== null) {
            moveCompletionSelection(false)(cm);
            return true;
          }
          return false;
        },
        preventDefault: true,
      },
    ]),
    keymap.of([...historyKeymap, indentWithTab]),
  ];
};

// Use the default keymap for completion
export { completionKeymap as autocompletionKeymap } from "@codemirror/autocomplete";
