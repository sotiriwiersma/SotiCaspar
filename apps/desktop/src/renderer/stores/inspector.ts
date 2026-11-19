import { getItemDefinition, type ControlChange, type PropValue } from '@soticaspar/core';
import { stringifyEntries } from '../lib/dataEditors';
import { commonFields, type CommonFields } from '../lib/common';
import type { EditOptions } from '../engine/rundownModel';
import { isGroupNode, patchProps, type TreeNode } from '../engine/tree';
import { app } from './app.svelte';
import { workspace } from './workspace.svelte';

export type ItemField = '@name' | '@label' | '@deviceName';

export const isItemField = (key: string): key is ItemField => key === '@name' || key === '@label' || key === '@deviceName';

/** Nodes of the current selection (always including the current node). */
function selection(): TreeNode[] {
  const model = workspace.active.model;
  const ids = new Set(model.selected);
  if (model.current) ids.add(model.current);
  return [...ids].map((id) => model.node(id)).filter((n): n is TreeNode => n !== undefined);
}

function idsOf(nodes: readonly TreeNode[]): string[] {
  return nodes.map((n) => n.id);
}

/**
 * Undo options of an inspector edit: keystrokes in one field on the same items are a single undo step, so undo
 * reverts what was typed, not one character.
 */
const step = (key: string, ids: readonly string[]): EditOptions => ({ label: 'Edit Properties', merge: `inspector:${key}:${ids.join(',')}` });

/** Reads a property of the current node, or one of its item level fields. */
export function readValue(node: TreeNode, key: string): PropValue {
  if (key === '@label') return node.label;
  if (isGroupNode(node)) return node.props[key] ?? '';
  if (key === '@name') return node.name;
  if (key === '@deviceName') return node.deviceName;
  return node.props[key] ?? '';
}

const isChecked = (value: PropValue): boolean => value === true || value === 'true';

/** How a value compares: checkboxes by checked state (`''`, `false` and `'false'` are all unchecked), others as text. */
const compareKey = (value: PropValue, checkbox: boolean): string => (checkbox ? String(isChecked(value)) : String(value ?? ''));

/** True when the nodes disagree on a property. */
function mixed(nodes: readonly TreeNode[], key: string, checkbox: boolean): boolean {
  return new Set(nodes.map((n) => compareKey(readValue(n, key), checkbox))).size > 1;
}

/** A type specific control differs between the selected nodes of the current node's type. */
export function isMixedTypeValue(key: string, checkbox = false): boolean {
  const current = workspace.active.model.currentNode;
  return !!current && mixed(selection().filter((n) => n.type === current.type), key, checkbox);
}

/** A field of the standard block (server, channel, layer ...) differs between the selected nodes that offer it. */
export function isMixedCommonValue(field: keyof CommonFields, key: string, checkbox = false): boolean {
  return mixed(selection().filter((n) => commonFields(n.type)[field]), key, checkbox);
}

/** Type specific control: applies to every selected node of the same type as the current one. */
export function applyTypeProp(key: string, value: PropValue, onChange?: ControlChange): void {
  const current = workspace.active.model.currentNode;
  if (!current) return;
  const ids = idsOf(selection().filter((n) => n.type === current.type));
  workspace.active.model.updateNodes(ids, (node) => patchProps(node, { [key]: value, ...onChange?.(value, node.props) }), step(key, ids));
}

/** Standard block (channel, layer, delay ...): applies to every selected node that offers that block. */
export function applyCommonProp(field: keyof CommonFields, key: string, value: PropValue, extra: Record<string, PropValue> = {}): void {
  const ids = idsOf(selection().filter((n) => commonFields(n.type)[field]));
  workspace.active.model.updateNodes(ids, (node) => patchProps(node, { [key]: value, ...extra }), step(key, ids));
}

/** Properties that identify one item (remote trigger id) only change the current node. */
export function applyCurrentProp(key: string, value: PropValue): void {
  const current = workspace.active.model.currentNode;
  if (current) workspace.active.model.updateNodes([current.id], (node) => patchProps(node, { [key]: value }), step(key, [current.id]));
}

/** Name (target), label and device are per item. The label follows the target while they were equal. */
export function applyItemField(field: ItemField, value: string): void {
  const model = workspace.active.model;
  const current = model.currentNode;
  if (!current) return;

  if (field === '@label') {
    model.updateNodes([current.id], (node) => ({ ...node, label: value }), step(field, [current.id]));
  } else if (field === '@name' && !isGroupNode(current)) {
    model.updateNodes(
      [current.id],
      (node) => (isGroupNode(node) ? node : { ...node, name: value, label: node.label === node.name ? value : node.label }),
      step(field, [current.id])
    );
  } else if (field === '@deviceName') {
    const device = app.deviceByName(value);
    const channel = device && device.lockedChannel > 0 && device.lockedChannel <= device.channels ? device.lockedChannel : 1;
    const ids = idsOf(selection().filter((n) => commonFields(n.type).device));
    model.updateNodes(ids, (node) => (isGroupNode(node) ? node : patchProps({ ...node, deviceName: value }, { channel })), step(field, ids));
  }
}

/** Library "Data" entries fill the data of the current template item: the stored data name becomes its only entry. */
export function applyStoredData(name: string): boolean {
  const current = workspace.active.model.currentNode;
  const definition = current ? getItemDefinition(current.type) : undefined;
  if (!current || !definition?.fields.some((f) => f.key === 'usestoreddata')) return false;
  workspace.active.model.updateNodes(
    [current.id],
    (node) => patchProps(node, { templatedata: stringifyEntries([{ key: 'f0', value: name }], 'id'), usestoreddata: true }),
    { label: 'Use Stored Data' }
  );
  return true;
}