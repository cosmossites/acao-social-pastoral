// script.js
// Este arquivo concentra a lógica do sistema: login, formulário, Firestore,
// busca, edição, exclusão, impressão e adaptação para celular.
// No JavaScript usamos // ou /* ... */ para comentar; <!-- ... --> é usado no HTML.

// 1. Importações do Firebase usadas direto pelo navegador via CDN.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  initializeFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// 2. Meses exibidos no controle mensal da ficha.
const months = [
  ["janeiro", "Janeiro"],
  ["fevereiro", "Fevereiro"],
  ["marco", "Março"],
  ["abril", "Abril"],
  ["maio", "Maio"],
  ["junho", "Junho"],
  ["julho", "Julho"],
  ["agosto", "Agosto"],
  ["setembro", "Setembro"],
  ["outubro", "Outubro"],
  ["novembro", "Novembro"],
  ["dezembro", "Dezembro"]
];

// 3. Estado geral da aplicação.
// Ele guarda dados temporários da tela, mas não salva dados pessoais no navegador.
const state = {
  auth: null,
  db: null,
  records: [],
  recordsLoaded: false,
  currentUserRole: "normal",
  pendingProfileRole: null,
  unsubscribe: null,
  recordsLoadTimer: null,
  deleteId: null,
  pendingCreateRef: null,
  toastTimer: null,
  authMode: "login"
};

// 4. Atalhos para elementos HTML usados várias vezes no código.
const $ = (selector) => document.querySelector(selector);
const loginScreen = $("#login-screen");
const appShell = $("#app-shell");
const loginForm = $("#login-form");
const loginButton = $("#login-button");
const loginError = $("#login-error");
const setupAlert = $("#setup-alert");
const passwordConfirmField = $("#password-confirm-field");
const ownerCodeField = $("#owner-code-field");
const cadastroForm = $("#cadastro-form");
const childrenList = $("#children-list");
const childrenEmpty = $("#children-empty");
const recordsList = $("#records-list");
const listStatus = $("#list-status");
const deleteDialog = $("#delete-dialog");
const workspace = $(".workspace");
const AUTH_TIMEOUT_MS = 10000;
const DATABASE_TIMEOUT_MS = 20000;
const LARGE_ERROR_DURATION_MS = 9500;
const OWNER_ACCESS_CODE = "igreja120131";
const ROLE_NORMAL = "normal";
const ROLE_ADMIN = "admin";

// 5. Funções auxiliares de texto, máscara e data.
function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function localDateString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

// 6. Funções de feedback visual para botões, erros e mensagens temporárias.
function setBusy(button, busy, busyText, defaultText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : defaultText;
}

function showLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = !message;
}

function showToast(message, isError = false, options = {}) {
  const toast = $("#toast");
  const isLarge = Boolean(options.large);
  const duration = options.duration || (isLarge ? LARGE_ERROR_DURATION_MS : 4200);

  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.toggle("is-large-error", isLarge);
  toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
    toast.classList.remove("is-large-error");
  }, duration);
}

function showLargeError(message) {
  showToast(message, true, { large: true });
}

// 7. Tradução dos erros técnicos do Firebase para mensagens simples ao usuário.
function readableAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "Este e-mail já possui uma conta. Use a opção Entrar.",
    "auth/configuration-not-found": "Ative o Firebase Authentication por e-mail e senha no Console do Firebase.",
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/missing-password": "Informe a senha.",
    "auth/operation-not-allowed": "A criação de contas ainda não foi ativada no Firebase Authentication.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/network-request-failed": "Não foi possível conectar ao Firebase. Verifique a internet."
  };
  if (error?.code === "auth/timeout") {
    return "O Firebase demorou para responder. Tente novamente em alguns segundos.";
  }
  return messages[error?.code] || "Não foi possível concluir o acesso. Verifique os dados e tente novamente.";
}

function readableFirestoreError(error, action = "salvar") {
  const messages = {
    "firestore/permission-denied": "Sua conta não tem permissão para acessar os cadastros.",
    "firestore/unauthenticated": "Sua sessão expirou. Saia e entre novamente.",
    "firestore/unavailable": "O banco está temporariamente indisponível. Verifique sua conexão.",
    "firestore/failed-precondition": "O banco Firestore ainda não está configurado corretamente.",
    "firestore/timeout": `Não foi possível confirmar a operação de ${action}. Verifique a consulta antes de repetir.`
  };
  return messages[error?.code] || `Não foi possível ${action}. Verifique a conexão e tente novamente.`;
}

// 8. Limite de espera para evitar botão travado quando a internet ou Firebase demora.
function withTimeout(promise, timeoutMs = AUTH_TIMEOUT_MS, timeoutCode = "auth/timeout") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
        const error = new Error("Tempo limite excedido");
        error.code = timeoutCode;
        reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function validateOwnerAccessCode(code) {
  if (code === OWNER_ACCESS_CODE) {
    return true;
  }

  showLoginError("Código de Administrador incorreto. Crie uma conta normal ou peça o código correto.");
  showLargeError(
    "CRIAÇÃO DE ADMINISTRADOR BLOQUEADA: somente quem tem o código da igreja pode criar uma conta com acesso total."
  );
  return false;
}

function isRegisterMode(mode = state.authMode) {
  return mode === "register-normal" || mode === "register-admin";
}

function authModeRole(mode = state.authMode) {
  return mode === "register-admin" ? ROLE_ADMIN : ROLE_NORMAL;
}

function roleLabel(role = state.currentUserRole) {
  return role === ROLE_ADMIN ? "Administrador" : "Pessoa normal";
}

function isAdmin() {
  return state.currentUserRole === ROLE_ADMIN;
}

function roleFromUser(user) {
  return user?.displayName === ROLE_ADMIN ? ROLE_ADMIN : ROLE_NORMAL;
}

async function saveUserRole(user, role) {
  if (!user || user.displayName === role) return;
  await withTimeout(updateProfile(user, { displayName: role }), AUTH_TIMEOUT_MS, "auth/timeout");
}

function applyAccessLevel(role) {
  state.currentUserRole = role;
  document.body.dataset.accessRole = role;
  $("#user-role").textContent = roleLabel(role);

  const notice = $("#role-notice");
  notice.hidden = false;
  notice.textContent = isAdmin()
    ? "Acesso de Administrador: você pode cadastrar, consultar, editar, imprimir e excluir registros."
    : "Acesso normal: você pode preencher e salvar uma ficha. Consultar, editar e excluir cadastros fica liberado somente para Administradores.";

  if (!isAdmin()) {
    setMobileView("form");
  }
}

// 9. Alterna a tela entre "Entrar", "Pessoa normal" e "Administrador".
function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = isRegisterMode(mode);
  const isOwnerRegister = mode === "register-admin";

  passwordConfirmField.hidden = !isRegister;
  ownerCodeField.hidden = !isOwnerRegister;
  $("#login-password-confirm").required = isRegister;
  $("#owner-code").required = isOwnerRegister;
  $("#login-password").autocomplete = isRegister ? "new-password" : "current-password";
  $("#login-password-label").textContent = isRegister ? "Criar senha" : "Senha";
  $("#password-confirm-label").textContent = "Confirmar senha";
  $("#auth-help").textContent = mode === "login"
    ? "Entre usando a senha da sua própria conta."
    : isOwnerRegister
      ? "Conta de Administrador tem acesso total. Use o código da igreja apenas nesta criação."
      : "Conta normal pode preencher e salvar fichas, mas não consulta nem altera todos os cadastros.";
  loginButton.textContent = mode === "login"
    ? "Entrar no sistema"
    : isOwnerRegister
      ? "Criar conta de Administrador"
      : "Criar conta normal";
  showLoginError("");

  document.querySelectorAll(".auth-mode-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authMode === mode);
  });
}

// 10. Cria os checkboxes dos meses por JavaScript para evitar repetição no HTML.
function renderMonths() {
  const container = $("#monthly-control");
  months.forEach(([key, label]) => {
    const wrapper = document.createElement("label");
    wrapper.className = "month-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "mes";
    input.value = key;

    const text = document.createElement("span");
    text.textContent = label;

    wrapper.append(input, text);
    container.append(wrapper);
  });
}

// 11. Funções da lista dinâmica de crianças.
function childCount() {
  return childrenList.querySelectorAll(".child-row").length;
}

function updateChildrenState(syncQuantity = true) {
  const count = childCount();
  childrenEmpty.hidden = count > 0;
  if (syncQuantity) {
    $("#qtd-criancas").value = String(count);
  }

  childrenList.querySelectorAll(".child-row").forEach((row, index) => {
    row.querySelector(".child-row-heading strong").textContent = `Criança ${index + 1}`;
  });
}

function createChildRow(child = {}) {
  const row = document.createElement("div");
  row.className = "child-row";

  const heading = document.createElement("div");
  heading.className = "child-row-heading";

  const title = document.createElement("strong");
  title.textContent = "Criança";

  const removeButton = document.createElement("button");
  removeButton.className = "remove-child-button";
  removeButton.type = "button";
  removeButton.textContent = "Remover";
  removeButton.addEventListener("click", () => {
    row.remove();
    updateChildrenState();
  });

  heading.append(title, removeButton);

  const fields = document.createElement("div");
  fields.className = "child-fields";

  const nameLabel = document.createElement("label");
  nameLabel.className = "field";
  const nameText = document.createElement("span");
  nameText.textContent = "Nome da criança *";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "child-name";
  nameInput.required = true;
  nameInput.value = child.nome || "";
  nameLabel.append(nameText, nameInput);

  const dateLabel = document.createElement("label");
  dateLabel.className = "field";
  const dateText = document.createElement("span");
  dateText.textContent = "Data de nascimento *";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "child-birthdate";
  dateInput.required = true;
  dateInput.value = child.dataNascimento || "";
  dateLabel.append(dateText, dateInput);

  fields.append(nameLabel, dateLabel);
  row.append(heading, fields);
  childrenList.append(row);
  updateChildrenState();
}

function getChildren() {
  return [...childrenList.querySelectorAll(".child-row")].map((row) => ({
    nome: row.querySelector(".child-name").value.trim(),
    dataNascimento: row.querySelector(".child-birthdate").value
  }));
}

function clearChildren() {
  childrenList.querySelectorAll(".child-row").forEach((row) => row.remove());
  updateChildrenState();
}

// 12. Ativa ou desativa os campos de desligamento conforme a resposta Sim/Não.
function setDisconnectionFields() {
  const isDisconnected = $("#desligamento").value === "Sim";
  const reason = $("#motivo-desligamento");
  const date = $("#data-desligamento");
  reason.disabled = !isDisconnected;
  date.disabled = !isDisconnected;
  reason.required = isDisconnected;
  date.required = isDisconnected;

  if (!isDisconnected) {
    reason.value = "";
    date.value = "";
  }
}

function getMonthlyControl() {
  return Object.fromEntries(
    months.map(([key]) => [key, Boolean($(`input[name="mes"][value="${key}"]`).checked)])
  );
}

// 13. Valida se a composição familiar está coerente antes de salvar.
function validateFamilyCounts() {
  const people = Number($("#qtd-pessoas").value);
  const adults = Number($("#qtd-adultos").value);
  const children = Number($("#qtd-criancas").value);

  if (adults + children !== people) {
    showToast("A quantidade de adultos e crianças deve ser igual ao total de pessoas na casa.", true);
    return false;
  }

  if (children !== childCount()) {
    showToast("A quantidade de crianças deve corresponder à lista de crianças.", true);
    return false;
  }

  return true;
}

// 14. Junta todos os campos do formulário em um objeto pronto para o Firestore.
function getFormData() {
  const nomeCompleto = $("#nome-completo").value.trim();
  const paroquiaComunidade = $("#paroquia-comunidade").value;

  return {
    paroquia: paroquiaComunidade,
    comunidade: "",
    paroquiaComunidade,
    dataCadastro: $("#data-cadastro").value,
    nomeCompleto,
    nomeBusca: normalizeText(nomeCompleto),
    endereco: $("#endereco").value.trim(),
    dataNascimento: $("#data-nascimento").value,
    cpf: formatCpf($("#cpf").value),
    cpfBusca: onlyDigits($("#cpf").value),
    telefone: formatPhone($("#telefone").value),
    telefoneBusca: onlyDigits($("#telefone").value),
    quantidadePessoas: Number($("#qtd-pessoas").value),
    quantidadeAdultos: Number($("#qtd-adultos").value),
    quantidadeCriancas: Number($("#qtd-criancas").value),
    criancas: getChildren(),
    observacoes: $("#observacoes").value.trim(),
    responsavelCadastro: $("#responsavel").value.trim(),
    controleMensal: getMonthlyControl(),
    desligamento: $("#desligamento").value,
    motivoDesligamento: $("#motivo-desligamento").value.trim(),
    dataDesligamento: $("#data-desligamento").value
  };
}

function recordPlace(record) {
  return record.paroquiaComunidade || record.paroquia || record.comunidade || "local não informado";
}

function validateUniquePersonRegistration(payload, editId) {
  if (!state.recordsLoaded) {
    showLargeError(
      "AGUARDE: a lista de cadastros ainda está carregando. Para evitar cadastro duplicado, tente salvar novamente em alguns segundos."
    );
    return false;
  }

  const originalRecord = editId ? findRecord(editId) : null;
  if (originalRecord?.paroquia && originalRecord.paroquia !== payload.paroquia) {
    showLargeError(
      `TROCA DE PARÓQUIA / COMUNIDADE BLOQUEADA: este cadastro já pertence à ${originalRecord.paroquia}. Não é permitido mover a mesma pessoa para ${payload.paroquia}.`
    );
    return false;
  }

  const cpfDigits = payload.cpfBusca || onlyDigits(payload.cpf);
  const nameKey = payload.nomeBusca || normalizeText(payload.nomeCompleto);

  const recordWithSameCpf = state.records.find((record) => {
    const recordCpf = record.cpfBusca || onlyDigits(record.cpf);
    return record.id !== editId && cpfDigits && recordCpf === cpfDigits;
  });

  if (recordWithSameCpf) {
    showLargeError(
      `CADASTRO DUPLICADO: este CPF já está cadastrado para ${recordWithSameCpf.nomeCompleto || "outra pessoa"} em ${recordPlace(recordWithSameCpf)}. Cada pessoa só pode ter um cadastro.`
    );
    return false;
  }

  const recordWithSameName = state.records.find((record) => {
    const recordName = record.nomeBusca || normalizeText(record.nomeCompleto);
    return (
      record.id !== editId &&
      nameKey &&
      recordName === nameKey
    );
  });

  if (recordWithSameName) {
    showLargeError(
      `CADASTRO DUPLICADO: já existe um cadastro com o nome ${recordWithSameName.nomeCompleto || payload.nomeCompleto} em ${recordPlace(recordWithSameName)}. Cada pessoa só pode ser cadastrada uma única vez.`
    );
    return false;
  }

  return true;
}

// 15. Controle do formulário: limpar, novo cadastro e carregar dados para edição.
function resetForm() {
  cadastroForm.reset();
  $("#edit-id").value = "";
  $("#form-title").textContent = "Novo cadastro";
  $("#save-button").textContent = "Salvar cadastro";
  $("#data-cadastro").value = localDateString();
  clearChildren();
  setDisconnectionFields();
}

function resetAsNewForm() {
  state.pendingCreateRef = null;
  resetForm();
}

function populateForm(record) {
  const paroquiaComunidade = record.paroquiaComunidade || record.paroquia || record.comunidade || "";

  state.pendingCreateRef = null;
  $("#edit-id").value = record.id;
  $("#form-title").textContent = "Editar cadastro";
  $("#save-button").textContent = "Atualizar cadastro";
  $("#paroquia-comunidade").value = paroquiaComunidade;
  $("#data-cadastro").value = record.dataCadastro || "";
  $("#nome-completo").value = record.nomeCompleto || "";
  $("#endereco").value = record.endereco || "";
  $("#data-nascimento").value = record.dataNascimento || "";
  $("#cpf").value = formatCpf(record.cpf || "");
  $("#telefone").value = formatPhone(record.telefone || "");
  $("#qtd-pessoas").value = record.quantidadePessoas ?? "";
  $("#qtd-adultos").value = record.quantidadeAdultos ?? "";
  $("#qtd-criancas").value = record.quantidadeCriancas ?? 0;
  $("#observacoes").value = record.observacoes || "";
  $("#responsavel").value = record.responsavelCadastro || "";
  $("#desligamento").value = record.desligamento || "Não";
  $("#motivo-desligamento").value = record.motivoDesligamento || "";
  $("#data-desligamento").value = record.dataDesligamento || "";

  clearChildren();
  (record.criancas || []).forEach(createChildRow);
  $("#qtd-criancas").value = record.quantidadeCriancas ?? childCount();

  months.forEach(([key]) => {
    $(`input[name="mes"][value="${key}"]`).checked = Boolean(record.controleMensal?.[key]);
  });

  setDisconnectionFields();
}

// 16. Funções para montar a lista de cadastros na tela sem usar innerHTML.
// Isso evita colocar HTML manualmente e reduz risco ao exibir dados digitados.
function createTextElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function findRecord(id) {
  return state.records.find((record) => record.id === id);
}

function editRecord(id, printAfter = false) {
  if (!isAdmin()) {
    showToast("Editar ou imprimir cadastros salvos é permitido somente para contas de Administrador.", true);
    return;
  }

  const record = findRecord(id);
  if (!record) return;
  populateForm(record);
  setMobileView("form");
  window.scrollTo({ top: 190, behavior: "smooth" });
  if (printAfter) {
    window.setTimeout(() => window.print(), 250);
  }
}

function makeRecordAction(label, action, isDanger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `record-action${isDanger ? " is-danger" : ""}`;
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

// 17. Renderiza os cadastros e aplica busca por nome, CPF ou telefone.
function renderRecords() {
  recordsList.replaceChildren();

  if (!isAdmin()) {
    $("#records-count").textContent = "Acesso normal";
    listStatus.hidden = false;
    listStatus.textContent = "Consulta disponível somente para contas de Administrador.";
    return;
  }

  const search = normalizeText($("#search-input").value);
  const searchDigits = onlyDigits($("#search-input").value);

  const filtered = state.records.filter((record) => {
    if (!search) return true;
    return (
      normalizeText(record.nomeCompleto).includes(search) ||
      (searchDigits && onlyDigits(record.cpf).includes(searchDigits)) ||
      (searchDigits && onlyDigits(record.telefone).includes(searchDigits))
    );
  });

  $("#records-count").textContent = `${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}`;
  listStatus.hidden = filtered.length > 0;
  listStatus.textContent = search
    ? "Nenhum cadastro encontrado para esta busca."
    : "Nenhum cadastro salvo.";

  filtered.forEach((record) => {
    const item = document.createElement("article");
    item.className = "record-item";

    const top = document.createElement("div");
    top.className = "record-top";
    const name = createTextElement("h3", "record-name", record.nomeCompleto || "Sem nome");
    const status = createTextElement("span", "record-status", record.desligamento === "Sim" ? "Desligado" : "Ativo");
    status.classList.toggle("is-inactive", record.desligamento === "Sim");
    top.append(name, status);

    const meta = document.createElement("div");
    meta.className = "record-meta";
    meta.append(
      createTextElement("span", "", record.paroquiaComunidade || record.paroquia || record.comunidade || "Paróquia / Comunidade não informada"),
      createTextElement("span", "", `CPF: ${record.cpf || "não informado"}`),
      createTextElement("span", "", `Telefone: ${record.telefone || "não informado"}`)
    );

    const actions = document.createElement("div");
    actions.className = "record-actions";
    actions.append(
      makeRecordAction("Editar", () => editRecord(record.id)),
      makeRecordAction("Imprimir", () => editRecord(record.id, true)),
      makeRecordAction("Excluir", () => {
        state.deleteId = record.id;
        deleteDialog.showModal();
      }, true)
    );

    item.append(top, meta, actions);
    recordsList.append(item);
  });
}

// 18. Abre uma escuta em tempo real da coleção "cadastros" no Firestore.
function subscribeToRecords() {
  state.unsubscribe?.();
  window.clearTimeout(state.recordsLoadTimer);
  state.recordsLoaded = false;
  listStatus.hidden = false;
  listStatus.textContent = "Carregando cadastros...";
  state.recordsLoadTimer = window.setTimeout(() => {
    if (listStatus.textContent === "Carregando cadastros...") {
      listStatus.textContent = "Não foi possível carregar a consulta. Verifique sua conexão e tente novamente.";
    }
  }, DATABASE_TIMEOUT_MS);

  state.unsubscribe = onSnapshot(
    collection(state.db, "cadastros"),
    (snapshot) => {
      window.clearTimeout(state.recordsLoadTimer);
      state.recordsLoaded = true;
      state.records = snapshot.docs
        .map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }))
        .sort((a, b) => normalizeText(a.nomeCompleto).localeCompare(normalizeText(b.nomeCompleto), "pt-BR"));
      renderRecords();
    },
    (error) => {
      window.clearTimeout(state.recordsLoadTimer);
      state.recordsLoaded = false;
      console.error("Falha ao ler os cadastros:", error.code);
      listStatus.hidden = false;
      listStatus.textContent = readableFirestoreError(error, "carregar os cadastros");
      showToast(readableFirestoreError(error, "carregar os cadastros"), true);
    }
  );
}

// 19. Inicializa Firebase, autenticação e banco.
// O arquivo firebase-config.js fica separado para facilitar a configuração do projeto.
async function initializeFirebase() {
  try {
    const configModule = await import("./firebase-config.js");
    const config = configModule.firebaseConfig;
    const hasPlaceholder = !config?.projectId || Object.values(config).some((value) => String(value).includes("SEU_"));

    if (hasPlaceholder) {
      throw new Error("Firebase config incompleta");
    }

    const firebaseApp = initializeApp(config);
    state.auth = getAuth(firebaseApp);
    state.db = initializeFirestore(firebaseApp, {
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false
    });

    // Mantém a sessão somente nesta aba; cadastros continuam exclusivamente no Firestore.
    await setPersistence(state.auth, browserSessionPersistence);

    onAuthStateChanged(state.auth, async (user) => {
      if (!user) {
        state.currentUserRole = ROLE_NORMAL;
        state.pendingProfileRole = null;
        document.body.removeAttribute("data-access-role");
        state.unsubscribe?.();
        state.unsubscribe = null;
        window.clearTimeout(state.recordsLoadTimer);
        state.records = [];
        state.recordsLoaded = false;
        $("#role-notice").hidden = true;
        loginScreen.hidden = false;
        appShell.hidden = true;
        setBusy(
          loginButton,
          false,
          isRegisterMode() ? "Criando conta..." : "Entrando...",
          loginButton.textContent || "Entrar no sistema"
        );
        return;
      }

      const accountWasCreated = isRegisterMode();
      const resolvedRole = state.pendingProfileRole || roleFromUser(user);
      await saveUserRole(user, resolvedRole);
      state.pendingProfileRole = null;

      $("#user-email").textContent = user.email || "Conta autenticada";
      loginScreen.hidden = true;
      appShell.hidden = false;
      showLoginError("");
      resetAsNewForm();
      applyAccessLevel(resolvedRole);

      // Abre a interface imediatamente; o Firestore carrega em segundo plano.
      subscribeToRecords();

      if (accountWasCreated) {
        showToast(`Conta criada com sucesso: ${roleLabel(resolvedRole)}.`);
        setAuthMode("login");
      }
    });
  } catch (error) {
    console.warn("Firebase não configurado:", error.message);
    setupAlert.hidden = false;
    loginButton.disabled = true;
    showLoginError("Crie o arquivo firebase-config.js para habilitar o acesso.");
  }
}

// 20. Funções específicas do modo celular.
function setMobileView(view) {
  if (view === "list" && !isAdmin()) {
    view = "form";
  }

  workspace.dataset.mobileView = view;
  document.querySelectorAll(".view-switcher-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
}

function openRecordsOnMobile() {
  if (!isAdmin()) {
    showToast("Consulta de cadastros disponível somente para contas de Administrador.", true);
    return;
  }

  setMobileView("list");
  $(".mobile-view-switcher").scrollIntoView({ behavior: "smooth", block: "start" });
}

// 21. Evento de login/criação de conta pelo Firebase Authentication.
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.auth) return;

  showLoginError("");
  const isRegister = isRegisterMode();
  const isOwnerRegister = state.authMode === "register-admin";
  const requestedRole = authModeRole();
  const defaultButtonText = isRegister
    ? isOwnerRegister ? "Criar conta de Administrador" : "Criar conta normal"
    : "Entrar no sistema";
  setBusy(loginButton, true, isRegister ? "Criando conta..." : "Entrando...", defaultButtonText);

  try {
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;

    if (isRegister) {
      if (password !== $("#login-password-confirm").value) {
        showLoginError("As senhas informadas não são iguais.");
        setBusy(loginButton, false, "Criando conta...", defaultButtonText);
        return;
      }

      if (isOwnerRegister && !validateOwnerAccessCode($("#owner-code").value.trim())) {
        setBusy(loginButton, false, "Criando conta...", defaultButtonText);
        return;
      }

      state.pendingProfileRole = requestedRole;
      const credential = await withTimeout(createUserWithEmailAndPassword(state.auth, email, password));
      await saveUserRole(credential.user, requestedRole);
    } else {
      state.pendingProfileRole = null;
      await withTimeout(signInWithEmailAndPassword(state.auth, email, password));
    }

    loginForm.reset();
  } catch (error) {
    state.pendingProfileRole = null;
    showLoginError(readableAuthError(error));
  } finally {
    setBusy(loginButton, false, isRegister ? "Criando conta..." : "Entrando...", defaultButtonText);
  }
});

// 22. Eventos dos botões e campos do formulário.
document.querySelectorAll(".auth-mode-button").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

$("#logout-button").addEventListener("click", async () => {
  if (!state.auth) return;
  state.pendingProfileRole = null;
  await signOut(state.auth);
  resetAsNewForm();
  setAuthMode("login");
});

$("#cpf").addEventListener("input", (event) => {
  event.target.value = formatCpf(event.target.value);
});

$("#telefone").addEventListener("input", (event) => {
  event.target.value = formatPhone(event.target.value);
});

$("#desligamento").addEventListener("change", setDisconnectionFields);
$("#add-child-button").addEventListener("click", () => createChildRow());
$("#new-button").addEventListener("click", resetAsNewForm);
$("#print-current-button").addEventListener("click", () => window.print());
$("#open-records-button").addEventListener("click", openRecordsOnMobile);
$("#search-input").addEventListener("input", renderRecords);

document.querySelectorAll(".view-switcher-button").forEach((button) => {
  button.addEventListener("click", () => setMobileView(button.dataset.view));
});

// 23. Salva novo cadastro ou atualiza cadastro existente no Firestore.
cadastroForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.db || !cadastroForm.reportValidity() || !validateFamilyCounts()) return;

  const cpfDigits = onlyDigits($("#cpf").value);
  const phoneDigits = onlyDigits($("#telefone").value);
  if (cpfDigits.length !== 11) {
    showToast("Informe um CPF com 11 dígitos.", true);
    $("#cpf").focus();
    return;
  }
  if (![10, 11].includes(phoneDigits.length)) {
    showToast("Informe um telefone brasileiro válido.", true);
    $("#telefone").focus();
    return;
  }

  const saveButton = $("#save-button");
  const editId = $("#edit-id").value;
  const defaultSaveText = editId ? "Atualizar cadastro" : "Salvar cadastro";
  setBusy(saveButton, true, "Salvando...", defaultSaveText);

  try {
    const payload = getFormData();
    if (!validateUniquePersonRegistration(payload, editId)) {
      return;
    }

    if (editId) {
      await withTimeout(
        updateDoc(doc(state.db, "cadastros", editId), {
          ...payload,
          atualizadoEm: serverTimestamp(),
          atualizadoPor: state.auth.currentUser?.email || ""
        }),
        DATABASE_TIMEOUT_MS,
        "firestore/timeout"
      );
      showToast("Cadastro atualizado com sucesso.");
    } else {
      const newRecordRef = state.pendingCreateRef || doc(collection(state.db, "cadastros"));
      state.pendingCreateRef = newRecordRef;
      await withTimeout(
        setDoc(newRecordRef, {
          ...payload,
          criadoEm: serverTimestamp(),
          criadoPor: state.auth.currentUser?.email || "",
          atualizadoEm: serverTimestamp(),
          atualizadoPor: state.auth.currentUser?.email || ""
        }),
        DATABASE_TIMEOUT_MS,
        "firestore/timeout"
      );
      state.pendingCreateRef = null;
      showToast(isAdmin() ? "Cadastro salvo com sucesso." : "Ficha salva com sucesso. A consulta fica disponível somente para Administradores.");
    }
    resetForm();
    if (isAdmin() && window.matchMedia("(max-width: 820px)").matches) {
      openRecordsOnMobile();
    }
  } catch (error) {
    console.error("Falha ao salvar cadastro:", error.code);
    if (error?.code !== "firestore/timeout" && !editId) {
      state.pendingCreateRef = null;
    }
    showToast(readableFirestoreError(error, "salvar o cadastro"), true);
  } finally {
    setBusy(saveButton, false, "Salvando...", defaultSaveText);
  }
});

// 24. Exclusão de cadastro após confirmação do usuário.
deleteDialog.addEventListener("close", async () => {
  if (deleteDialog.returnValue !== "confirm" || !state.deleteId || !state.db) {
    state.deleteId = null;
    return;
  }

  if (!isAdmin()) {
    state.deleteId = null;
    showToast("Excluir cadastros é permitido somente para contas de Administrador.", true);
    return;
  }

  const id = state.deleteId;
  state.deleteId = null;
  try {
    await withTimeout(
      deleteDoc(doc(state.db, "cadastros", id)),
      DATABASE_TIMEOUT_MS,
      "firestore/timeout"
    );
    if ($("#edit-id").value === id) resetForm();
    showToast("Cadastro excluído.");
  } catch (error) {
    console.error("Falha ao excluir cadastro:", error.code);
    showToast(readableFirestoreError(error, "excluir o cadastro"), true);
  }
});

// 25. Inicialização da página.
renderMonths();
resetForm();
setMobileView("form");
initializeFirebase();
