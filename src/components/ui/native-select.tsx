"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./select"

/**
 * Drop-in for a native `<select>`: same props and `<option>` / `<optgroup>`
 * children, but rendered as the styled AutoShift dropdown instead of the
 * operating system's menu. `onChange` receives `{ target: { value } }`, so
 * existing `e.target.value` handlers keep working.
 */
type ChangeLike = { target: { value: string }; currentTarget: { value: string } }

export interface NativeSelectProps {
  value?: string | number
  defaultValue?: string | number
  onChange?: (event: ChangeLike) => void
  disabled?: boolean
  required?: boolean
  name?: string
  id?: string
  className?: string
  children?: React.ReactNode
  "aria-label"?: string
  "aria-invalid"?: boolean | "true" | "false"
  "aria-describedby"?: string
  size?: "sm" | "default"
}

interface Opt {
  value: string
  label: string
  disabled: boolean
}
type Entry = { kind: "option"; opt: Opt } | { kind: "group"; label: string; options: Opt[] }

// Base UI treats "" like "no value"; keep a real item for <option value="">.
const EMPTY = "\u0000empty"
const encode = (v: string) => (v === "" ? EMPTY : v)
const decode = (v: string) => (v === EMPTY ? "" : v)

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function toOpt(el: React.ReactElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>): Opt {
  const label = textOf(el.props.children)
  return { value: el.props.value !== undefined ? String(el.props.value) : label, label, disabled: !!el.props.disabled }
}

function collect(children: React.ReactNode): Entry[] {
  const out: Entry[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment) {
      out.push(...collect((child.props as { children?: React.ReactNode }).children))
    } else if (child.type === "optgroup") {
      const props = child.props as { label?: string; children?: React.ReactNode }
      const options: Opt[] = []
      for (const e of collect(props.children)) if (e.kind === "option") options.push(e.opt)
      out.push({ kind: "group", label: props.label ?? "", options })
    } else if (child.type === "option") {
      out.push({ kind: "option", opt: toOpt(child as React.ReactElement<{ value?: string; children?: React.ReactNode }>) })
    }
  })
  return out
}

export function NativeSelect({
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  className,
  children,
  size = "default",
  ...aria
}: NativeSelectProps) {
  const collected = collect(children)
  // A leading `<option value="">Select a template…</option>` is a prompt, not a
  // choice: show it as the field's placeholder instead of a ticked list item.
  const first = collected[0]
  const prompt = first?.kind === "option" && first.opt.value === "" && /(…|\.\.\.)$/.test(first.opt.label.trim()) ? first.opt : null
  const entries = prompt ? collected.slice(1) : collected
  const all = entries.flatMap((e) => (e.kind === "option" ? [e.opt] : e.options))
  const items = Object.fromEntries(all.map((o) => [encode(o.value), o.label]))
  // null = nothing chosen yet, so the trigger shows the prompt as a placeholder.
  const current = value === undefined ? undefined : prompt && String(value) === "" ? null : encode(String(value))
  const initial = defaultValue !== undefined ? encode(String(defaultValue)) : all[0] ? encode(all[0].value) : undefined

  const item = (o: Opt) => (
    <SelectItem key={o.value} value={encode(o.value)} disabled={o.disabled} className={o.value === "" ? "text-muted-foreground" : undefined}>
      {o.label}
    </SelectItem>
  )

  return (
    <Select
      items={items}
      value={current}
      defaultValue={current === undefined ? initial : undefined}
      onValueChange={(v) => {
        const next = v == null ? "" : decode(String(v))
        onChange?.({ target: { value: next }, currentTarget: { value: next } })
      }}
      disabled={disabled}
      required={required}
      name={name}
    >
      <SelectTrigger id={id} size={size} className={cn("w-full", className)} {...aria}>
        <SelectValue placeholder={prompt?.label} />
      </SelectTrigger>
      <SelectContent>
        {entries.map((e, i) =>
          e.kind === "option" ? (
            item(e.opt)
          ) : (
            <SelectGroup key={`g${i}`}>
              <SelectLabel>{e.label}</SelectLabel>
              {e.options.map(item)}
            </SelectGroup>
          ),
        )}
      </SelectContent>
    </Select>
  )
}
