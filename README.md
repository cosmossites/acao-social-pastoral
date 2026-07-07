# Ação Solidária

Site estático para GitHub Pages, feito com HTML, CSS e JavaScript puro. O sistema usa:

- **Firebase Authentication** para criação de conta e login por e-mail e senha.
- **Níveis de acesso no site**: pessoa normal e Administrador.
- **Firebase Firestore** para armazenar os cadastros.
- **Firestore Security Rules** para impedir acesso sem login no Firebase.
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

Os arquivos principais foram organizados com comentários explicativos para facilitar a leitura:

- HTML usa comentários no formato `<!-- comentário -->`.
- CSS usa comentários no formato `/* comentário */`.
- JavaScript e regras do Firestore usam comentários no formato `// comentário`.

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
4. O próprio site mostrará as opções **Entrar**, **Pessoa normal** e **Administrador**.

## 4. Tipos de conta

O sistema tem dois tipos de conta:

- **Pessoa normal**: cria conta com e-mail e senha própria. Pode preencher e salvar fichas, mas não vê a consulta geral de cadastros, não edita cadastros salvos e não exclui registros.
- **Administrador**: cria conta com e-mail, senha própria e o código de Administrador. Pode cadastrar, consultar, editar, imprimir e excluir registros.

O código para criar uma conta de Administrador é:

```text
igreja120131
```

Esse código é usado somente na criação da conta de Administrador. Depois que a conta existe, o login é feito com o e-mail e a senha escolhida pela própria pessoa.

**Atenção:** como este é um site estático, um código colocado no JavaScript pode ser visto por quem souber inspecionar os arquivos publicados. Para uso real com dados sensíveis, o mais seguro é liberar Administradores por aprovação manual, e-mails autorizados, custom claims do Firebase ou regras mais fortes no Firestore.

## 5. Criar o banco Firestore

1. No Console do Firebase, abra **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha a região apropriada.
4. Inicie em modo de produção.
5. O sistema criará a coleção `cadastros` ao salvar o primeiro registro.

## 6. Configurar as Firestore Security Rules

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

**Atenção:** com essa regra, qualquer conta autenticada no Firebase poderá acessar tecnicamente a coleção no banco. A diferença entre pessoa normal e Administrador foi feita na interface do site para o projeto. Para segurança real, as regras do Firestore também precisam validar cargos/permissões no servidor.

## 7. Testar localmente

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

1. Criar uma conta de pessoa normal com uma senha própria.
2. Confirmar que pessoa normal consegue salvar ficha, mas não vê a consulta geral.
3. Criar uma conta de Administrador usando o código `igreja120131` e uma senha própria.
4. Confirmar que Administrador consegue consultar, editar, imprimir e excluir cadastros.
5. Testar se o sistema bloqueia cadastro duplicado pelo mesmo CPF ou mesmo nome completo.
6. Testar campos obrigatórios, CPF, telefone e composição familiar.
7. Testar celular e computador.

## 8. Publicar no GitHub Pages

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

Mesmo com níveis de acesso na tela, compartilhe o endereço do sistema somente com pessoas responsáveis pela ação solidária. Para dados sensíveis, o modelo mais seguro continua sendo exigir aprovação manual antes de liberar acesso total.

## Funcionamento das imagens

O layout usa:

- `assets/santa-edwiges.png`
- `assets/amigos-da-cruz.png`
- `assets/igreja-santa-edwiges.jpg`
- `assets/igreja-santa-cecilia.png`

Se uma imagem não existir ou falhar ao carregar, ela é ocultada e o restante do layout continua funcionando.
