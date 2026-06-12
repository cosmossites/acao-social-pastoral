import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

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

const state = {
  auth: null,
  db: null,
  records: [],
  unsubscribe: null,
  recordsLoadTimer: null,
  deleteId: null,
  pendingCreateRef: null,
  toastTimer: null,
  authMode: "login"
};

const $ = (selector) => document.querySelector(selector);
const loginScreen = $("#login-screen");
const appShell = $("#app-shell");
const loginForm = $("#login-form");
const loginButton = $("#login-button");
const loginError = $("#login-error");
const setupAlert = $("#setup-alert");
const passwordConfirmField = $("#password-confirm-field");
const cadastroForm = $("#cadastro-form");
const childrenList = $("#children-list");
const childrenEmpty = $("#children-empty");
const recordsList = $("#records-list");
const listStatus = $("#list-status");
const deleteDialog = $("#delete-dialog");
const workspace = $(".workspace");
const AUTH_TIMEOUT_MS = 10000;
const DATABASE_TIMEOUT_MS = 8000;

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

function setBusy(button, busy, busyText, defaultText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : defaultText;
}

function showLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = !message;
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

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

function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";
  passwordConfirmField.hidden = !isRegister;
  $("#login-password-confirm").required = isRegister;
  $("#login-password").autocomplete = isRegister ? "new-password" : "current-password";
  loginButton.textContent = isRegister ? "Criar conta e entrar" : "Entrar no sistema";
  showLoginError("");

  document.querySelectorAll(".auth-mode-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authMode === mode);
  });
}

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

function getFormData() {
  const nomeCompleto = $("#nome-completo").value.trim();
  return {
    paroquia: $("#paroquia").value,
    comunidade: $("#comunidade").value.trim(),
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
  state.pendingCreateRef = null;
  $("#edit-id").value = record.id;
  $("#form-title").textContent = "Editar cadastro";
  $("#save-button").textContent = "Atualizar cadastro";
  $("#paroquia").value = record.paroquia || "";
  $("#comunidade").value = record.comunidade || "";
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

function renderRecords() {
  recordsList.replaceChildren();
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
      createTextElement("span", "", record.comunidade || record.paroquia || "Comunidade não informada"),
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

function subscribeToRecords() {
  state.unsubscribe?.();
  window.clearTimeout(state.recordsLoadTimer);
  listStatus.hidden = false;
  listStatus.textContent = "Carregando cadastros...";
  state.recordsLoadTimer = window.setTimeout(() => {
    if (listStatus.textContent === "Carregando cadastros...") {
      listStatus.textContent = "O banco demorou para responder. Verifique a conexão e as regras do Firestore.";
    }
  }, DATABASE_TIMEOUT_MS);

  state.unsubscribe = onSnapshot(
    collection(state.db, "cadastros"),
    (snapshot) => {
      window.clearTimeout(state.recordsLoadTimer);
      state.records = snapshot.docs
        .map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }))
        .sort((a, b) => normalizeText(a.nomeCompleto).localeCompare(normalizeText(b.nomeCompleto), "pt-BR"));
      renderRecords();
    },
    (error) => {
      window.clearTimeout(state.recordsLoadTimer);
      console.error("Falha ao ler os cadastros:", error.code);
      listStatus.hidden = false;
      listStatus.textContent = "Não foi possível carregar os cadastros. Verifique as regras de acesso.";
      showToast("Acesso ao Firestore negado. Confira as Security Rules.", true);
    }
  );
}

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
    state.db = getFirestore(firebaseApp);

    // Mantém a sessão somente nesta aba; cadastros continuam exclusivamente no Firestore.
    await setPersistence(state.auth, browserSessionPersistence);

    onAuthStateChanged(state.auth, (user) => {
      if (!user) {
        state.unsubscribe?.();
        state.unsubscribe = null;
        window.clearTimeout(state.recordsLoadTimer);
        state.records = [];
        loginScreen.hidden = false;
        appShell.hidden = true;
        setBusy(
          loginButton,
          false,
          state.authMode === "register" ? "Criando conta..." : "Entrando...",
          state.authMode === "register" ? "Criar conta e entrar" : "Entrar no sistema"
        );
        return;
      }

      const accountWasCreated = state.authMode === "register";
      $("#user-email").textContent = user.email || "Conta autenticada";
      loginScreen.hidden = true;
      appShell.hidden = false;
      showLoginError("");
      resetAsNewForm();

      // Abre a interface imediatamente; o Firestore carrega em segundo plano.
      subscribeToRecords();

      if (accountWasCreated) {
        showToast("Conta criada com sucesso.");
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

function setMobileView(view) {
  workspace.dataset.mobileView = view;
  document.querySelectorAll(".view-switcher-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
}

function openRecordsOnMobile() {
  setMobileView("list");
  $(".mobile-view-switcher").scrollIntoView({ behavior: "smooth", block: "start" });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.auth) return;

  showLoginError("");
  const isRegister = state.authMode === "register";
  const defaultButtonText = isRegister ? "Criar conta e entrar" : "Entrar no sistema";
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
      await withTimeout(createUserWithEmailAndPassword(state.auth, email, password));
    } else {
      await withTimeout(signInWithEmailAndPassword(state.auth, email, password));
    }

    loginForm.reset();
  } catch (error) {
    showLoginError(readableAuthError(error));
  } finally {
    setBusy(loginButton, false, isRegister ? "Criando conta..." : "Entrando...", defaultButtonText);
  }
});

document.querySelectorAll(".auth-mode-button").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

$("#logout-button").addEventListener("click", async () => {
  if (!state.auth) return;
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
      showToast("Cadastro salvo com sucesso.");
    }
    resetForm();
    if (window.matchMedia("(max-width: 820px)").matches) {
      openRecordsOnMobile();
    }
  } catch (error) {
    console.error("Falha ao salvar cadastro:", error.code);
    const message = error?.code === "firestore/timeout"
      ? "O banco demorou para responder. O botão foi liberado; confira a consulta antes de tentar novamente."
      : "Não foi possível salvar. Verifique a conexão e as regras do Firestore.";
    if (error?.code !== "firestore/timeout" && !editId) {
      state.pendingCreateRef = null;
    }
    showToast(message, true);
  } finally {
    setBusy(saveButton, false, "Salvando...", defaultSaveText);
  }
});

deleteDialog.addEventListener("close", async () => {
  if (deleteDialog.returnValue !== "confirm" || !state.deleteId || !state.db) {
    state.deleteId = null;
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
    showToast("Não foi possível excluir o cadastro.", true);
  }
});

renderMonths();
resetForm();
setMobileView("form");
initializeFirebase();
