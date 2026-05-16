// ParamPanel — renders a GeneratedClip's paramsSchema as a form of
// inputs, writes edits back to clip.params via the project store.
//
// Lives in components/ParamPanel/ for symmetry with AIPanel/, but is
// mounted inside InspectorPanel as a Section (GeneratedClipSection
// alias) so the visual layout matches Shape / SVG inspector sections.
//
// Keyframe binding is intentionally out of scope for feat-007 — see
// the plan and feat-009.

import React, { useCallback, useMemo } from "react";
import { ColorPicker, LabeledSlider as Slider, Switch } from "@openreel/ui";
import { useProjectStore } from "../../stores/project-store";
import { schemaToFields, type FieldDescriptor } from "./schemaToFields";

interface Props {
  readonly clipId: string;
}

export const ParamPanel: React.FC<Props> = ({ clipId }) => {
  // useProjectStore returns the store hook; subscribing to project.modifiedAt
  // ensures we re-render when params mutate.
  const modifiedAt = useProjectStore((s) => s.project.modifiedAt);
  const clip = useMemo(
    () => useProjectStore.getState().getGeneratedClip(clipId),
    // re-evaluate when the project changes (params edits bump modifiedAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clipId, modifiedAt],
  );

  const fields = useMemo(
    () => (clip ? schemaToFields(clip.paramsSchema, clip.params) : []),
    [clip],
  );

  const updateParam = useCallback(
    (key: string, value: unknown) => {
      const store = useProjectStore.getState();
      const current = store.getGeneratedClip(clipId);
      if (!current) return;
      store.updateGeneratedClipParams(clipId, {
        ...(current.params ?? {}),
        [key]: value,
      });
    },
    [clipId],
  );

  if (!clip) {
    return (
      <div className="text-[10px] text-text-muted px-1 py-2">
        Generated clip not found.
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="text-[10px] text-text-muted px-1 py-2">
        This object exposes no editable parameters. Edit the source to add
        a <code>paramsSchema</code>.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="text-[10px] text-text-muted px-1">
        Provider:{" "}
        <code className="text-text-secondary">{clip.providerId}</code>
        {clip.model ? (
          <>
            {" · "}
            <code className="text-text-secondary">{clip.model}</code>
          </>
        ) : null}
      </div>
      {fields.map((field) => (
        <FieldRow key={field.key} field={field} onChange={updateParam} />
      ))}
    </div>
  );
};

// GeneratedClipSection is the same component, re-exported under the name
// the InspectorPanel imports — keeps naming consistent with sister
// inspector sections (ShapeSection, SVGSection, ...).
export const GeneratedClipSection = ParamPanel;

interface FieldRowProps {
  readonly field: FieldDescriptor;
  readonly onChange: (key: string, value: unknown) => void;
}

const FieldRow: React.FC<FieldRowProps> = ({ field, onChange }) => {
  switch (field.kind) {
    case "color":
      return (
        <Row label={field.label}>
          <ColorPicker
            value={field.value}
            onChange={(v) => onChange(field.key, v)}
            className="max-w-[170px]"
          />
        </Row>
      );

    case "number": {
      // If we have both min and max, render a slider for direct
      // manipulation. Otherwise fall back to a number input.
      if (
        typeof field.min === "number" &&
        typeof field.max === "number" &&
        field.max > field.min
      ) {
        return (
          <Row label={field.label}>
            <div className="w-[170px]">
              <Slider
                label=""
                value={field.value}
                min={field.min}
                max={field.max}
                step={field.step ?? (field.max - field.min) / 100}
                onChange={(v) => onChange(field.key, v)}
              />
            </div>
          </Row>
        );
      }
      return (
        <Row label={field.label}>
          <input
            type="number"
            value={field.value}
            min={field.min}
            max={field.max}
            step={field.step ?? "any"}
            onChange={(e) =>
              onChange(field.key, Number.parseFloat(e.target.value) || 0)
            }
            className="w-20 px-2 py-1 text-[10px] font-mono text-text-primary bg-background-tertiary border border-border rounded text-right outline-none focus:border-primary"
          />
        </Row>
      );
    }

    case "select":
      return (
        <Row label={field.label}>
          <select
            value={field.value}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="text-[10px] bg-background-tertiary border border-border rounded px-2 py-1"
          >
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Row>
      );

    case "boolean":
      return (
        <Row label={field.label}>
          <Switch
            checked={field.value}
            onCheckedChange={(v) => onChange(field.key, v)}
          />
        </Row>
      );

    case "text":
      return (
        <Row label={field.label}>
          <input
            type="text"
            value={field.value}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="w-[170px] px-2 py-1 text-[10px] text-text-primary bg-background-tertiary border border-border rounded outline-none focus:border-primary"
          />
        </Row>
      );

    case "vector":
      return (
        <Row label={field.label}>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={field.value.x}
              step="any"
              onChange={(e) =>
                onChange(field.key, {
                  ...field.value,
                  x: Number.parseFloat(e.target.value) || 0,
                })
              }
              className="w-16 px-2 py-1 text-[10px] font-mono text-text-primary bg-background-tertiary border border-border rounded text-right outline-none focus:border-primary"
            />
            <input
              type="number"
              value={field.value.y}
              step="any"
              onChange={(e) =>
                onChange(field.key, {
                  ...field.value,
                  y: Number.parseFloat(e.target.value) || 0,
                })
              }
              className="w-16 px-2 py-1 text-[10px] font-mono text-text-primary bg-background-tertiary border border-border rounded text-right outline-none focus:border-primary"
            />
          </div>
        </Row>
      );

    case "unknown":
    default:
      return (
        <Row label={field.label}>
          <pre className="text-[10px] text-text-muted bg-background-tertiary rounded px-2 py-1 max-w-[170px] overflow-auto">
            {JSON.stringify(field.value)}
          </pre>
        </Row>
      );
  }
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex items-center justify-between gap-2 px-1">
    <span className="text-[10px] text-text-secondary">{label}</span>
    {children}
  </div>
);
