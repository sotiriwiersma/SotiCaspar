import { getItemDefinition, type ControlChange, type PropValue } from '@soticaspar/core';
import { stringifyEntries } from '../lib/dataEditors';
import { commonFields, type CommonFields } from '../lib/common';
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

/** Reads a property of the current node, or one of its item level fields. */
export function readValue(node: TreeNode, key: string): PropValue {
  if (key === '@label') return node.label;
  if (isGroupNode(node)) return node.props[key] ?? '';
  if (key === '@name') return node.name;
  if (key === '@deviceName') return node.deviceName;
  return node.props[key] ?? '';
}

/** Type specific control: applies to every selected node of the same type as the current one. */
export function applyTypeProp(key: string, value: PropValue, onChange?: ControlChange): void {
  const current = workspace.active.model.currentNode;
  if (!current) return;
  workspace.active.model.updateNodes(idsOf(selection().filter((n) => n.type === current.type)), (node) =>
    patchProps(node, { [key]: value, ...onChange?.(value, node.props) })
  );
}

/** Standard block (channel, layer, delay ...): applies to every selected node that offers that block. */
export function applyCommonProp(field: keyof CommonFields, key: string, value: PropValue, extra: Record<string, PropValue> = {}): void {
  const targets = selection().filter((n) => commonFields(n.type)[field]);
  workspace.active.model.updateNodes(idsOf(targets), (node) => patchProps(node, { [key]: value, ...extra }));
}

/** Properties that identify one item (remote trigger id) only change the current node. */
export function applyCurrentProp(key: string, value: PropValue): void {
  const current = workspace.active.model.currentNode;
  if (current) workspace.active.model.updateNodes([current.id], (node) => patchProps(node, { [key]: value }));
}

/** Name (target), label and device are per item. The label follows the target while they were equal. */
export function applyItemField(field: ItemField, value: string): void {
  const model = workspace.active.model;
  const current = model.currentNode;
  if (!current) return;

  if (field === '@label') {
    model.updateNodes([current.id], (node) => ({ ...node, label: value }));
  } else if (field === '@name' && !isGroupNode(current)) {
    model.updateNodes([current.id], (node) => (isGroupNode(node) ? node : { ...node, name: value, label: node.label === node.name ? value : node.label }));
  } else if (field === '@deviceName') {
    const device = app.deviceByName(value);
    const channel = device && device.lockedChannel > 0 && device.lockedChannel <= device.channels ? device.lockedChannel : 1;
    const targets = selection().filter((n) => commonFields(n.type).device);
    model.updateNodes(idsOf(targets), (node) => (isGroupNode(node) ? node : patchProps({ ...node, deviceName: value }, { channel })));
  }
}

/** Library "Data" entries fill the data of the current template item: the stored data name becomes its only entry. */
export function applyStoredData(name: string): boolean {
  const current = workspace.active.model.currentNode;
  const definition = current ? getItemDefinition(current.type) : undefined;
  if (!current || !definition?.fields.some((f) => f.key === 'usestoreddata')) return false;
  workspace.active.model.updateNodes([current.id], (node) =>
    patchProps(node, { templatedata: stringifyEntries([{ key: 'f0', value: name }], 'id'), usestoreddata: true })
  );
  return true;
}