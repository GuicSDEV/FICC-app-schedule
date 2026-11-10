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

O app recebe push pelo **Firebase Cloud Messaging** (grátis). Sem configurar, o app funciona
normalmente, só não recebe notificações. Uma vez só:

1. Em [console.firebase.google.com](https://console.firebase.google.com) → **Adicionar projeto**
   (ex.: `ficc-tenis`; o Google Analytics pode ficar desligado).
2. **Adicionar app → Android** com o pacote `br.com.ficctenis.app` → baixe o
   `google-services.json` e coloque em `apps/mobile/android/app/`.
3. **Adicionar app → iOS** com o bundle ID `br.com.ficctenis.app` → baixe o
   `GoogleService-Info.plist` e coloque em `apps/mobile/ios/App/App/` (no Xcode, arraste o arquivo
   para a pasta **App** marcando o alvo **App**).
4. iPhone: no [developer.apple.com](https://developer.apple.com) → **Keys** → crie uma chave com
   **Apple Push Notifications service (APNs)**, baixe o `.p8` e envie no Firebase → Configurações do
   projeto → **Cloud Messaging** → configuração do app Apple. No Xcode, em **Signing &
   Capabilities**, adicione **Push Notifications** e **Background Modes → Remote notifications**.
5. Servidor: Firebase → Configurações do projeto → **Contas de serviço** → **Gerar nova chave
   privada**. Converta e cole na variável `FIREBASE_SERVICE_ACCOUNT` do serviço **api** no Railway:

   ```bash
   base64 -i ficc-tenis-firebase-adminsdk.json | pbcopy   # copia para colar no Railway
   ```

6. Rode `pnpm --filter @ficc/mobile sync` de novo: com os dois arquivos no lugar, o plugin de push
   entra no app.

Os arquivos do Firebase e a chave ficam fora do Git (`.gitignore`). Guarde-os junto das outras
chaves do projeto.

No app, o sócio liga as notificações no **Perfil** (ou no aviso do início), como na versão web.

## Links que abrem o app

Links de torneio (`/t/…`) e do app (`/app/…`) abrem direto no app instalado quando o site tem um
domínio próprio (ex.: `app.ficc.com.br`):

- **Android:** no Play Console → **Integridade do app** → copie o **SHA-256** do certificado de
  assinatura do app e coloque em `APP_LINKS_ANDROID_SHA256` no serviço **web** do Railway. No
  `AndroidManifest.xml`, adicione dentro da `<activity>`:

  ```xml
  <intent-filter android:autoVerify="true">
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="https" android:host="app.ficc.com.br" />
  </intent-filter>
  ```

- **iPhone:** coloque o **Team ID** (developer.apple.com → Membership) em `APP_LINKS_IOS_TEAM_ID`
  no serviço **web** e, no Xcode, **Signing & Capabilities → Associated Domains** →
  `applinks:app.ficc.com.br`.

Confira em `https://app.ficc.com.br/.well-known/assetlinks.json` e
`/.well-known/apple-app-site-association`.

## Exigências das lojas (já no app)

- **Excluir minha conta** em Perfil (exigência da Apple): pede a senha, cancela as reservas futuras
  (avisando os outros jogadores), apaga os dados pessoais e libera a matrícula. Partidas passadas
  ficam no histórico dos outros como "Ex-sócio".
- **Política de privacidade** em `/privacidade` e **Termos de uso** em `/termos`, públicas (sem
  login), com links no login e no Perfil. Use `https://<domínio>/privacidade` no cadastro das lojas.
  O contato mostrado vem de `LEGAL_CONTACT_EMAIL` no serviço **web**.
- **Continuar logado:** a sessão renova a cada uso e só expira depois de `REFRESH_TOKEN_TTL_DAYS`
  dias sem abrir o app (padrão 30). Para o app, recomendamos `REFRESH_TOKEN_TTL_DAYS=90` na **api**.
- **Tamanho de letra:** no iPhone o texto acompanha o tamanho de letra do celular (Ajustes → Tela e
  Brilho → Tamanho do Texto).

## O que o app faz de nativo

- Notificações push (Firebase), com toque abrindo a tela certa.
- Vibração (haptics) nas confirmações.
- Compartilhamento pelo menu do sistema (link de torneio, passe de convidado em imagem).
- Barra de status acompanhando o tema, tela de abertura e ícone com a logo.
- Botão voltar do Android navegando pelas telas (e saindo do app na primeira).
- Leitura de QR na portaria com a câmera (a mesma tela do site, com a permissão da câmera do app).
- Links do site abrindo no app (com domínio próprio, acima).
