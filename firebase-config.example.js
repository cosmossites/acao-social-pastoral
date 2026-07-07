// firebase-config.example.js
// Modelo para configurar o Firebase no projeto.
//
// Para usar:
// 1. Copie este arquivo.
// 2. Renomeie a cópia para firebase-config.js.
// 3. Troque os valores abaixo pelos dados do seu Firebase Web App.
//
// Importante:
// Estes dados do Firebase Web App são públicos.
// A segurança real fica no Firebase Authentication e nas Firestore Security Rules.
// Nunca coloque senhas, chaves privadas ou arquivos de conta de serviço aqui.

export const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};
