# Ação Social Pastoral

Site estático para GitHub Pages, feito com HTML, CSS e JavaScript puro. O sistema usa:

- **Firebase Authentication** para criação de conta e login por e-mail e senha.
- **Firebase Firestore** para armazenar os cadastros.
- **Firestore Security Rules** para permitir acesso a qualquer conta autenticada.
- Sessão de autenticação limitada à aba do navegador.
- Nenhum uso de `localStorage` para guardar dados pessoais.

## Atenção à privacidade

Os cadastros contêm CPF, endereço, telefone e dados de crianças. Essas informações:

- **Nunca devem ser colocadas no GitHub**, nem mesmo em repositório privado.
- Não devem aparecer em arquivos de teste, screenshots, commits, Issues ou Pull Requests.
- Não devem ser exportadas para dentro da pasta publicada pelo GitHub Pages.
- Devem ser acessadas apenas por pessoas que realmente participam do atendimento e estão orientadas sobre sigilo.

O GitHub Pages publica os arquivos do frontend. Os dados pessoais ficam exclusivamente no Firestore, protegidos pelas regras de segurança.

## Arquivos

- `index.html`: telas de login, formulário e lista de cadastros.
- `style.css`: layout responsivo e impressão.
- `script.js`: autenticação, validações, máscaras e operações no Firestore.
- `firebase-config.example.js`: modelo da configuração pública do Firebase Web App.
- `firestore.rules`: regra para permitir o banco a qualquer conta autenticada.
- `assets/`: imagens usadas no topo e na tela de login.

## 1. Criar o projeto no Firebase

1. Acesse o [Console do Firebase](https://console.firebase.google.com/).
2. Clique em **Adicionar projeto**.
3. Defina um nome para o projeto e conclua a criação.
4. Na página inicial do projeto, adicione um aplicativo **Web**.
5. Copie o objeto `firebaseConfig` exibido pelo Firebase.

O `firebaseConfig` de um Firebase Web App é uma configuração pública, não uma chave secreta. A segurança real deve ser feita com Authentication e Firestore Security Rules. Nunca coloque senhas, chaves privadas de conta de serviço ou arquivos administrativos no código.

## 2. Configurar o arquivo do Firebase

1. Faça uma cópia de `firebase-config.example.js`.
2. Renomeie a cópia para `firebase-config.js`.
3. Substitua os valores de exemplo pelos dados do seu Firebase Web App.

Exemplo:

```js
export const firebaseConfig = {
  apiKey: "CONFIGURACAO_PUBLICA_DO_FIREBASE",
  authDomain: "meu-projeto.firebaseapp.com",
  projectId: "meu-projeto",
  storageBucket: "meu-projeto.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};
```

O arquivo `firebase-config.js` pode ser publicado no GitHub Pages porque contém somente a configuração pública do Firebase Web App. Isso não substitui as Security Rules e ele nunca deve conter senhas ou chaves privadas.

## 3. Ativar Authentication por e-mail e senha

1. No Console do Firebase, abra **Authentication**.
2. Clique em **Começar**.
3. Em **Sign-in method**, ative **E-mail/senha**.
4. O próprio site mostrará as opções **Entrar** e **Criar conta**.

Qualquer pessoa que acessar o site poderá criar uma conta usando um e-mail e uma senha com pelo menos 6 caracteres.

## 4. Criar o banco Firestore

1. No Console do Firebase, abra **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha a região apropriada.
4. Inicie em modo de produção.
5. O sistema criará a coleção `cadastros` ao salvar o primeiro registro.

## 5. Configurar as Firestore Security Rules

No Firestore, abra a aba **Rules**, substitua o conteúdo pelo modelo abaixo e publique:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /cadastros/{cadastroId} {
      allow read, create, update, delete: if request.auth != null;
    }
  }
}
```

O mesmo conteúdo está no arquivo `firestore.rules`.

**Atenção:** com essa regra, qualquer pessoa que criar uma conta poderá ler, criar, editar e excluir todos os cadastros compartilhados. O sistema exige login, mas não exige aprovação manual.

## 6. Testar localmente

Por usar módulos JavaScript, abra o projeto por um servidor HTTP local, não diretamente pelo arquivo `index.html`.

Com Python:

```bash
python -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000
```

Teste com:

1. Criar uma nova conta pelo site.
2. Sair e entrar novamente com a conta criada.
3. Campos obrigatórios, CPF, telefone e composição familiar.
4. Cadastro, busca, edição, impressão e exclusão.
5. Celular e computador.

## 7. Publicar no GitHub Pages

1. Crie um repositório que contenha somente os arquivos do frontend.
2. Confirme que nenhum cadastro, exportação do Firestore, screenshot com dados ou credencial secreta está na pasta.
3. Envie os arquivos para o GitHub.
4. No repositório, abra **Settings > Pages**.
5. Em **Build and deployment**, escolha publicação a partir de uma branch.
6. Selecione a branch e a pasta raiz.
7. Salve e aguarde o endereço do GitHub Pages.
8. No Firebase Authentication, abra **Settings > Authorized domains** e adicione o domínio do GitHub Pages, se necessário.

## Segurança recomendada

- Revise periodicamente a lista de contas criadas no Firebase Authentication.
- Exclua imediatamente contas desconhecidas ou de quem deixar a equipe.
- Use senhas fortes.
- Revise periodicamente Authentication, regras e acessos.
- Não compartilhe contas entre pessoas.
- Não use dados reais para demonstrações públicas.
- Nunca desative as Security Rules para resolver erro de acesso.
- Considere políticas internas de retenção e exclusão de dados.

Como o cadastro de contas é público, compartilhe o endereço do sistema somente com pessoas da pastoral. Para dados sensíveis, o modelo mais seguro continua sendo exigir aprovação manual antes de liberar acesso.

## Funcionamento das imagens

O layout usa:

- `assets/santa-edwiges.png`
- `assets/amigos-da-cruz.png`
- `assets/igreja-santa-edwiges.jpg`

Se uma imagem não existir ou falhar ao carregar, ela é ocultada e o restante do layout continua funcionando.
