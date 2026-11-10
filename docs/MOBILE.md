# App nativo (App Store e Google Play)

O app **FICC Tênis** para iPhone e Android fica em `apps/mobile` (Capacitor). Ele abre o site já
publicado (o mesmo do Railway) dentro de um app nativo e soma recursos do celular: notificações
push, câmera para o QR da portaria, compartilhamento, barra de status e tela de abertura com a
logo. Toda mudança no site chega ao app sozinha; só mudanças nativas (plugins, ícone, permissões)
precisam de uma nova versão nas lojas.

- Identificador nas lojas: `br.com.ficctenis.app` (não muda depois do primeiro envio).
- Endereço do site: variável `APP_URL`, lida pelo `cap sync`.

## Testar no iPhone (simulador do Xcode)

Precisa de um Mac com o **Xcode** (App Store) instalado e aberto uma vez para aceitar a licença.

```bash
cd ~/FICC-app-schedule        # a pasta do projeto
git pull
pnpm install

# Opção A: contra o site no Railway (https)
APP_URL=https://<endereço-do-web>.up.railway.app pnpm --filter @ficc/mobile sync:ios

# Opção B: contra o pnpm dev do próprio Mac (rode `pnpm dev` em outro terminal antes)
APP_URL=http://localhost:3000 pnpm --filter @ficc/mobile sync:ios

pnpm --filter @ficc/mobile open:ios
```

No Xcode: espere ele baixar os pacotes (barra de cima), escolha um iPhone no topo (ex.:
**iPhone 16**) e clique em ▶︎ (Run). O app abre no simulador com o ícone e o nome FICC Tênis.

Rodar de novo o `sync:ios` sempre que trocar o `APP_URL` ou depois de um `git pull` que mexa em
`apps/mobile`.

Para instalar no seu iPhone de verdade: conecte o cabo, em **Signing & Capabilities** escolha o seu
time (sua conta Apple) e selecione o iPhone no topo antes do ▶︎.

## Testar no Android

Precisa do **Android Studio**.

```bash
APP_URL=https://<endereço-do-web>.up.railway.app pnpm --filter @ficc/mobile sync:android
pnpm --filter @ficc/mobile open:android
```

No Android Studio, escolha um emulador (Device Manager) e clique em ▶︎. Para testar contra o
`pnpm dev` do Mac no emulador use `APP_URL=http://10.0.2.2:3000`.

## Notificações push (Firebase)

Sem os arquivos do Firebase o app funciona normalmente, só não recebe push. O guia completo de
configuração e de publicação nas lojas fica neste arquivo à medida que a Fase 12 avança.

## Limitações conhecidas

- No iPhone a leitura de QR usa a câmera pela página (o plugin nativo de QR ainda não tem suporte
  ao gerenciador de pacotes do Xcode); no Android usa o leitor nativo.
