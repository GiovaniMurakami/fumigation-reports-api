# Fumigation Reports API

API REST em Node/TypeScript preparada para AWS Lambda, MongoDB Atlas e S3. Em desenvolvimento, se não houver `.env` nesta pasta, o servidor também lê o `.env` da API de exemplo no diretório pai; assim `MONGODB_URI` é realmente reaproveitada sem duplicar o segredo.

## Rodar

```bash
npm install
npm run dev
```

No deploy, configure `MONGODB_URI`, `JWT_SECRET`, `AWS_S3_BUCKET`, `CORS_ORIGIN` e `PUBLIC_APP_URL` no ambiente e execute `npm run deploy:dev` ou `npm run deploy:prod`.

O bucket pode permanecer privado: a API gera URLs pré-assinadas de leitura para exibir as evidências. A identidade AWS da API precisa de `s3:PutObject` e `s3:GetObject` no prefixo `fumigacao/*`. Nunca envie credenciais AWS ao React: o browser recebe apenas URLs temporárias.

Para desenvolvimento local, aplique `s3-cors.json` ao bucket:

```bash
aws s3api put-bucket-cors --bucket SEU_BUCKET --cors-configuration file://s3-cors.json
```

Antes da produção, acrescente o domínio HTTPS do Amplify em `AllowedOrigins`.
