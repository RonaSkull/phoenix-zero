# Phoenix Zero — Dependências (inventário completo)

Este documento lista **todas as dependências** do projeto, separadas por workspace (root, web, core, mobile), com indicação do que já está instalado e o que pode faltar para as novas features (Home/landings, i18n, UI components, etc.).

---

## 1) Root (monorepo)

Arquivo: `package.json`

### Dependências

- `@phoenix-zero/core` (local, file: `./libs/phoenix-zero`)

### DevDependencies

- `@types/node` ^20.11.10
- `@playwright/test` ^1.41.2
- `ffmpeg-static` ^5.2.0
- `ffprobe-static` ^3.1.0
- `sphincs` ^3.0.0
- `tsx` ^4.7.0
- `typescript` ^5.3.3

> **Status:** Completo para scripts de build, benchmark e testes.

---

## 2) Core (`libs/phoenix-zero`)

Arquivo: `libs/phoenix-zero/package.json`

### Dependências (criptografia)

- `@noble/curves` ^1.4.0
- `@noble/hashes` ^1.4.0
- `@scure/base` ^1.1.3

### OptionalDependencies (processamento de mídia)

- `ffmpeg-static` ^5.2.0
- `sphincs` ^3.0.4
- `sharp` ^0.33.5

> **Status:** Completo para watermark, fingerprint, assinaturas e Q-STEP.

---

## 3) Web (`apps/web`)

Arquivo: `apps/web/package.json`

### Dependências

- `@phoenix-zero/core` (local)
- `jszip` ^3.10.1
- `next` ^14.1.0
- `react` ^18.2.0
- `react-dom` ^18.2.0
- `sharp` ^0.33.5

### DevDependencies

- `@types/node` ^20.11.10
- `@types/react` ^18.2.55
- `@types/react-dom` ^18.2.19
- `typescript` ^5.3.3

### OptionalDependencies

- `@next/swc-win32-x64` ^14.2.35

> **Status:** Funcional para APIs, embeds, OG image, upload/download. **Falta UI components e i18n.**

---

## 4) Mobile (`apps/mobile`)

Arquivo: `apps/mobile/package.json`

### Dependências

- `@phoenix-zero/core` (local)
- `@react-native-async-storage/async-storage` 1.23.1
- `@scure/base` ^1.1.3
- `expo` ~50.0.0
- `expo-document-picker` ~12.0.1
- `expo-file-system` ~16.0.5
- `expo-random` ~14.0.1
- `react` 18.2.0
- `react-native` 0.73.6

### DevDependencies

- `@types/react` ^18.2.55
- `typescript` ^5.3.3

> **Status:** Completo para Expo/React Native.

---

## 5) O que falta para Home/landings (sugestão)

### 5.1) UI Components (opcional, mas recomendado)

- `tailwindcss` + `autoprefixer` + `postcss` (se quiser CSS utility-first)
- `@radix-ui/*` (primitives: accordion, tabs, etc.)
- `lucide-react` (ícones)
- `class-variance-authority` + `clsx` + `tailwind-merge` (estilo)
- `framer-motion` (animações, se quiser)
- `react-intersection-observer` (scroll triggers)

### 5.2) Internacionalização (i18n)

- **Opção A (leve):** apenas JSON + hook customizado (sem lib)
- **Opção B (lib):** `next-intl` ou `react-i18next`
- Se usar URL param (`/pt/...`), pode precisar de `next-intl`

### 5.3) SEO e OG

- Já tem `sharp` e `next/og` (não falta nada)

### 5.4) Testes

- `@testing-library/react` + `jest` (se quiser testes de UI)
- `@playwright/test` já está no root

---

## 6) O que falta para DevOps/produção (opcional)

- `@next/bundle-analyzer` (análise de bundle)
- `cross-env` (scripts cross-platform)
- `eslint` + `prettier` (lint/format)
- `husky` + `lint-staged` (git hooks)

---

## 7) Resumo (dependências faltantes vs já instaladas)

| Workspace | Dependências já instaladas | O que pode faltar (Home/landings) |
|-----------|----------------------------|----------------------------------|
| Root      | Scripts, TS, Playwright, FFmpeg, Sphincs | Nada (ok) |
| Core      | Cripto + mídia (opcional) | Nada (ok) |
| Web       | Next, React, Sharp, JSZip | UI components, i18n (se quiser lib) |
| Mobile    | Expo, React Native, AsyncStorage | Nada (ok) |

> **Conclusão:** O projeto está **bem equipado** para as features atuais. Para Home/landings, só precisa de UI components e i18n (se quiser lib; senão, JSON + hook customizado funciona).

---

## 8) Sugestão de instalação (se quiser adicionar UI components)

```bash
# UI (opcional)
npm install --prefix ./apps/web tailwindcss autoprefixer postcss
npm install --prefix ./apps/web @radix-ui/react-accordion @radix-ui/react-tabs lucide-react class-variance-authority clsx tailwind-merge

# i18n (opcional)
# Opção A: JSON + hook (não precisa instalar nada)
# Opção B: lib
npm install --prefix ./apps/web next-intl
```

> Se não quiser adicionar libs, pode implementar Home/landings com **CSS modules** ou **styled-jsx** (já vem com Next) e **JSON simples** para i18n.
