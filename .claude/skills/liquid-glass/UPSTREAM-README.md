# Liquid Glass - Claude Code Skill

A [Claude Code](https://claude.com/claude-code) skill for building and migrating Apple platform apps with SwiftUI's **Liquid Glass** design system (iOS 26+, macOS 26+, iPadOS 26+).

## What This Skill Does

When installed, Claude Code gains deep knowledge of Apple's Liquid Glass design system introduced at WWDC 2025. It can:

- **Migrate existing apps** to Liquid Glass with a structured 5-phase workflow
- **Build new apps from scratch** using glass-native patterns
- **Apply all glass APIs** correctly: `.glassEffect()`, `.backgroundExtensionEffect()`, `.buttonStyle(.glass)`, `GlassEffectContainer`, morphing transitions, and more
- **Handle platform differences** across iOS, iPadOS, macOS, watchOS, tvOS, and visionOS
- **Avoid common pitfalls** with tested solutions for known issues

The skill auto-activates when you discuss SwiftUI glass design, or invoke it manually with `/liquid-glass:liquid-glass`.

## Install

### Step 1: Add the marketplace

```
/plugin marketplace add haider-nawaz/liquid-glass-skill
```

### Step 2: Install the plugin

```
/plugin install liquid-glass@liquid-glass-skills
```

### Step 3: Use it

Ask Claude Code to work with Liquid Glass — it will automatically apply the skill. Or invoke directly:

```
/liquid-glass:liquid-glass
```

## What's Included

| File | Description |
|------|-------------|
| `SKILL.md` | Core instructions — key APIs, quick start, migration summary |
| `references/api-reference.md` | Complete API reference for all glass modifiers and types |
| `references/migration-guide.md` | 5-phase migration workflow for existing apps |
| `references/platform-specifics.md` | iOS, macOS, iPadOS, watchOS, tvOS, visionOS details |
| `references/pitfalls-and-solutions.md` | Known issues with tested solutions |
| `examples/landmarks-patterns.md` | Real code patterns from Apple's Landmarks sample app |

## APIs Covered

- `glassEffect(_:in:)` — glass material on any view
- `Glass` struct — `.regular`, `.clear`, `.identity`, `.tint()`, `.interactive()`
- `GlassEffectContainer` — grouped glass with shared sampling
- `glassEffectID(_:in:)` — morphing transitions
- `glassEffectUnion` — combined glass surfaces
- `backgroundExtensionEffect()` — content behind navigation layer
- `.buttonStyle(.glass)` / `.buttonStyle(.glassProminent)` — glass buttons
- `ToolbarSpacer`, `ToolbarItemGroup` — glass toolbar layout
- `.tabBarMinimizeBehavior(.onScrollDown)` — glass tab bars
- Glass sheets with `.presentationDetents`
- UIKit bridge via `UIGlassEffect`

## Sources

Built from analysis of:
- [Apple: Landmarks - Building an app with Liquid Glass](https://developer.apple.com/documentation/SwiftUI/Landmarks-Building-an-app-with-Liquid-Glass)
- [Apple: Applying Liquid Glass to custom views](https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views)
- [WWDC25 Session 323](https://developer.apple.com/videos/play/wwdc2025/323/)
- Community references and real-world adoption experiences

## License

MIT
