# Fumigation Reports API

API REST em Node/TypeScript preparada para AWS Lambda, MongoDB Atlas e S3. Em desenvolvimento, se não houver `.env` nesta pasta, o servidor também lê o `.env` da API de exemplo no diretório pai; assim `MONGODB_URI` é realmente reaproveitada sem duplicar o segredo.

## Rodar

```bash
npm install
npm run dev
```

No deploy, configure `MONGODB_URI`, `JWT_SECRET`, `AWS_S3_BUCKET`, `CORS_ORIGIN` e `PUBLIC_APP_URL` no ambiente e execute `npm run deploy:dev` ou `npm run deploy:prod`.

O bucket precisa permitir leitura das evidências (ou ser servido por CloudFront) e CORS para `PUT` vindo do domínio do app. Nunca envie credenciais AWS ao React: o browser recebe apenas uma URL de upload válida por cinco minutos.
