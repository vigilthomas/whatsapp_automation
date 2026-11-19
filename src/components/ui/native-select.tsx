"use client";

/**
 * NativeSelect — a themed drop-in for `<select>`.
 *
 * Why this exists: a real `<select>` opens an OS-drawn option list that
 * ignores the app theme (white in dark mode, system font, no brand
 * colours). Rewriting every call site to the compound Select API would
 * touch a lot of form logic, so this component keeps the native calling
 * convention instead:
 *
 *   <NativeSelect value={v} onChange={(e) => set(e.target.value)} className="…">
 *     <option value="">None</option>
 *     <option value="a">A</option>
 *     <optgroup label="More"><option value="b">B</option></optgroup>
 *   </NativeSelect>
 *
 * `<option>` / `<optgroup>` children are read (not rendered) and turned
 * into themed Select items. `onChange` receives an event-shaped object
 * with `target.value` (and `currentTarget.value`) as a string, exactly
 * like the native element, so existing handlers work unchanged.
 *
 * Gotcha: base-ui can't use "" as an item value (it means "nothing
 * selected"), so the empty option is mapped to a sentinel internally and
 * back to "" on the way out.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY = "__empty__";
const toInner = (v: string) => (v === "" ? EMPTY : v);
const toOuter = (v: string) => (v === EMPTY ? "" : v);

type Opt = { value: string; label: React.ReactNode; disabled?: boolean };
type Group = { label?: React.ReactNode; options: Opt[] };

/** Flatten `<option>` / `<optgroup>` children (arrays, fragments, conditionals) into groups. */
function readOptions(children: React.ReactNode): Group[] {
  const groups: Group[] = [{ options: [] }];
  const visit = (node: React.ReactNode, group: Group) => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;
      const props = child.props as {
        value?: string | number;
        children?: React.ReactNode;
        disabled?: boolean;
        label?: React.ReactNode;
      };
      if (child.type === React.Fragment) {
        visit(props.children, group);
      } else if (child.type === "optgroup") {
        const g: Group = { label: props.label, options: [] };
        groups.push(g);
        visit(props.children, g);
      } else if (child.type === "option") {
        const value = props.value ?? (typeof props.children === "string" ? props.children : "");
        group.options.push({ value: String(value), label: props.children, disabled: props.disabled });
      }
    });
  };
  visit(children, groups[0]);
  return groups.filter((g) => g.options.length > 0);
}

export type NativeSelectChangeEvent = {
  target: { value: string; name?: string };
  currentTarget: { value: string; name?: string };
};

export interface NativeSelectProps {
  value?: string | number | null;
  defaultValue?: string | number;
  onChange?: (event: NativeSelectChangeEvent) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  title?: string;
  placeholder?: React.ReactNode;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
}

export function NativeSelect({
  value,
  defaultValue,
  onChange,
  children,
  className,
  disabled,
  required,
  name,
  id,
  title,
  placeholder,
  autoFocus,
  ...aria
}: NativeSelectProps) {
  const groups = React.useMemo(() => readOptions(children), [children]);
  const all = groups.flatMap((g) => g.options);
  const labels = new Map(all.map((o) => [o.value, o.label]));

  // Uncontrolled use (defaultValue only) keeps its own state, like <select>.
  const [inner, setInner] = React.useState(() => String(defaultValue ?? all[0]?.value ?? ""));
  const current = value === undefined ? inner : String(value ?? "");

  const handle = (next: string | null) => {
    const v = toOuter(next ?? EMPTY);
    if (value === undefined) setInner(v);
    onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } });
  };

  return (
    <Select
      value={toInner(current)}
      onValueChange={(v) => handle(v as string | null)}
      disabled={disabled}
      required={required}
      name={name}
    >
      <SelectTrigger
        id={id}
        title={title}
        autoFocus={autoFocus}
        {...aria}
        className={cn(
          // Like a native <select>: as wide as its content unless the call
          // site sets a width (most form fields pass `w-full`).
          "h-9 w-fit min-w-32 max-w-full justify-between bg-card text-foreground",
          className,
        )}
      >
        <SelectValue placeholder={placeholder}>
          {(v: string | null) => {
            const label = labels.get(toOuter(v ?? EMPTY));
            return label ?? <span className="text-muted-foreground">{placeholder ?? "—"}</span>;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-72">
        {groups.map((g, gi) =>
          g.label ? (
            <SelectGroup key={gi}>
              <SelectLabel>{g.label}</SelectLabel>
              {g.options.map((o) => (
                <SelectItem key={o.value} value={toInner(o.value)} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            g.options.map((o) => (
              <SelectItem key={o.value} value={toInner(o.value)} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))
          ),
        )}
      </SelectContent>
    </Select>
  );
}
