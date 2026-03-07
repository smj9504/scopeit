/**
 * ScopeIt - Frontend Tool Registry
 *
 * Maps tool IDs to lazy-loaded React components.
 * Adding a new tool: add one entry here + create the component file.
 */
import { lazy, ComponentType } from 'react';

export interface ToolComponentProps {
  sessionId?: string;
  onCreateEstimate?: (sessionId: string) => void;
}

const RoofAnalyzerTool = lazy(
  () => import('./roof-analyzer/RoofAnalyzerTool')
);

const PackingTool = lazy(
  () => import('./packing/PackingTool')
);

export const TOOL_COMPONENT_REGISTRY: Record<string, ComponentType<ToolComponentProps>> = {
  roof_analyzer: RoofAnalyzerTool,
  packing: PackingTool,
};

export function getToolComponent(
  toolId: string
): ComponentType<ToolComponentProps> | null {
  return TOOL_COMPONENT_REGISTRY[toolId] ?? null;
}
