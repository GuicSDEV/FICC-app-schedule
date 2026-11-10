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

## Publicar nas lojas

### Contas (uma vez)

- **Apple Developer Program:** [developer.apple.com/programs](https://developer.apple.com/programs)
  → Enroll como pessoa física, US$ 99/ano. Na loja aparece o seu nome como vendedor.
- **Google Play Console:** [play.google.com/console](https://play.google.com/console) → conta
  pessoal, US$ 25 uma vez. Contas pessoais novas precisam de um **teste fechado com 12 testadores
  por 14 dias** antes de publicar em produção: convide sócios do clube.

### Antes de cada versão

```bash
git pull && pnpm install
pnpm --filter @ficc/mobile version:set 1.0.0   # 1.0.1, 1.1.0… a cada envio
APP_URL=https://app.ficc.com.br pnpm --filter @ficc/mobile sync
```

O `APP_URL` precisa ser o endereço **de produção** (o app aponta para ele para sempre).

### iPhone (App Store Connect)

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps → +** → nome
   **FICC Tênis**, idioma Português (Brasil), bundle ID `br.com.ficctenis.app`, SKU `ficc-tenis`.
2. `pnpm --filter @ficc/mobile open:ios` → no Xcode, alvo **App → Signing & Capabilities** →
   **Team**: a sua conta; marque **Automatically manage signing**.
3. Topo do Xcode: escolha **Any iOS Device (arm64)** → menu **Product → Archive** → na janela que
   abre, **Distribute App → App Store Connect → Upload**.
4. Em uns 15 minutos o build aparece em **TestFlight**: instale no seu iPhone pelo app TestFlight
   e teste. Depois, em **Distribuição**, escolha o build, preencha a ficha (abaixo) e
   **Enviar para revisão**.

### Android (Google Play)

1. Gere a chave de assinatura uma vez e **guarde muito bem** (sem ela não dá para atualizar o
   app):

   ```bash
   keytool -genkey -v -keystore ~/ficc-tenis-upload.jks -keyalg RSA -keysize 2048 \
     -validity 10000 -alias upload
   ```

2. `pnpm --filter @ficc/mobile open:android` → **Build → Generate Signed App Bundle or APK → Android
   App Bundle** → escolha o `.jks` → **release**. O arquivo sai em
   `android/app/release/app-release.aab`.
3. Play Console → **Criar app** (FICC Tênis, app, gratuito) → **Testes → Teste fechado** → envie o
   `.aab`, adicione os testadores e, depois dos 14 dias, **Produção**.
4. Deixe a assinatura do app com o Google (**Play App Signing**, padrão) e copie o SHA-256 de
   **Integridade do app** para `APP_LINKS_ANDROID_SHA256` (links que abrem o app).

### Ficha da loja

- **Nome:** FICC Tênis · **Subtítulo (Apple):** Quadras, aulas e ranking do clube
- **Descrição:** Reserve quadras do Foz do Iguaçu Country Clube, convide parceiros, marque aulas,
  lance resultados e acompanhe o ranking Elo, os torneios e os avisos do clube. Exclusivo para
  sócios do FICC.
- **Categoria:** Esportes · **Classificação:** Livre / 4+
- **Política de privacidade:** `https://app.ficc.com.br/privacidade`
- **Prints:** gere com o comando abaixo (demo com dados fictícios) e envie as pastas
  `iphone-6.9` e `iphone-6.5` na Apple e `android-phone` no Google:

  ```bash
  APP_URL=https://<demo>.up.railway.app SHOT_PASSWORD=demo1234 pnpm --filter @ficc/mobile screenshots
  ```

  Saem em `apps/mobile/store/screenshots/` (fora do Git).

- **Conta para a revisão:** a Apple e o Google precisam entrar no app. Crie na produção um sócio de
  teste (matrícula e senha) e informe em **Informações de revisão** (Apple) e **Acesso ao app**
  (Google), com a nota: “Use a aba Sócio com a matrícula e a senha acima.”

### Privacidade nas lojas (questionários)

Responda com base na [política](/privacidade):

- **Dados coletados:** nome, identificador do usuário (matrícula), foto (opcional), conteúdo do
  usuário (reservas, partidas), identificador do aparelho (push). Todos **vinculados à pessoa**,
  usados para **funcionalidade do app**. **Nenhum** para rastreamento ou publicidade.
- **Google (Segurança dos dados):** dados criptografados em trânsito: sim. O usuário pode pedir a
  exclusão: sim (no app, Perfil → Excluir minha conta; e pela URL da política).
- **Apple:** “Não usamos dados para rastrear” (sem App Tracking Transparency).

### O que precisa de nova versão na loja

| Mudança                                                 | Como chega ao celular    |
| ------------------------------------------------------- | ------------------------ |
| Telas, textos, regras, cores do site, API, banco        | Deploy normal no Railway |
| Ícone, tela de abertura, nome do app, permissões        | Nova versão nas lojas    |
| Plugins nativos novos, `capacitor.config.ts`, `APP_URL` | Nova versão nas lojas    |
