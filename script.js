// ==========================================
// CONFIGURAÇÕES & ESTADO
// ==========================================
let listaCNPJs = [];
let resultados = [];
let indiceAtual = 0;
let processando = false;
let errosSeguidos = 0;
const LIMITE_ERRO = 5;
const STORAGE_KEY = "cnpj_master_v3_backup";

// Ao carregar a página, verifica se existe backup
document.addEventListener('DOMContentLoaded', () => {
    const backup = localStorage.getItem(STORAGE_KEY);
    if (backup) {
        const dados = JSON.parse(backup);
        if (dados.resultados && dados.listaCNPJs && dados.indiceAtual < dados.listaCNPJs.length) {
            document.getElementById('txtRestoreCount').innerText = dados.resultados.length;
            document.getElementById('restoreArea').style.display = 'block';
        }
    }
});

// ==========================================
// 1. VALIDAÇÃO MATEMÁTICA
// ==========================================
function validarMatematicaCNPJ(cnpj) {
    cnpj = cnpj.replace(/[^\d]+/g, '');
    if (cnpj === '') return false;
    if (cnpj.length !== 14) return false;
    // Elimina CNPJs com todos os dígitos iguais
    if (/^(\d)\1+$/.test(cnpj)) return false;

    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(0)) return false;

    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(1)) return false;

    return true;
}

// ==========================================
// 2. INTERFACE E ARQUIVOS
// ==========================================
window.abrirModal = () => document.getElementById('modal').style.display = 'flex';
window.fecharModal = () => document.getElementById('modal').style.display = 'none';

window.mudarAba = (tipo) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    if (tipo === 'arquivo') {
        document.querySelector('.tab:nth-child(1)').classList.add('active');
        document.getElementById('tabArquivo').style.display = 'block';
    } else {
        document.querySelector('.tab:nth-child(2)').classList.add('active');
        document.getElementById('tabTexto').style.display = 'block';
    }
};

window.processarEntrada = () => {
    const inputArquivo = document.getElementById('fileInput');
    const inputTexto = document.getElementById('textInput');
    
    if (document.getElementById('tabArquivo').style.display !== 'none' && inputArquivo.files.length > 0) {
        const file = inputArquivo.files[0];
        const reader = new FileReader();
        reader.onload = (e) => { iniciarComLista(e.target.result); };
        reader.readAsText(file);
    } else {
        iniciarComLista(inputTexto.value);
    }
};

function iniciarComLista(textoBruto) {
    listaCNPJs = textoBruto.split('\n').map(c => c.trim()).filter(c => c !== '');
    if (listaCNPJs.length === 0) return alert("Lista vazia!");

    resultados = [];
    indiceAtual = 0;
    errosSeguidos = 0;
    limparSessao();
    
    document.getElementById('txtTotal').innerText = "0 / " + listaCNPJs.length;
    document.getElementById('txtSucesso').innerText = "0";
    document.getElementById('txtErro').innerText = "0";
    document.getElementById('progressBar').value = 0;
    document.getElementById('progressBar').max = listaCNPJs.length;
    
    fecharModal();
    rodarProcesso();
}

// ==========================================
// 3. AUTO-SAVE E RESTAURAÇÃO
// ==========================================
function salvarProgresso() {
    const estado = { listaCNPJs, resultados, indiceAtual };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
}

window.limparSessao = () => {
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('restoreArea').style.display = 'none';
};

window.restaurarSessao = () => {
    const backup = JSON.parse(localStorage.getItem(STORAGE_KEY));
    listaCNPJs = backup.listaCNPJs;
    resultados = backup.resultados;
    indiceAtual = backup.indiceAtual;
    
    let suc = resultados.filter(r => r.status === "SUCESSO").length;
    let err = resultados.length - suc;
    
    document.getElementById('txtTotal').innerText = `${indiceAtual} / ${listaCNPJs.length}`;
    document.getElementById('txtSucesso').innerText = suc;
    document.getElementById('txtErro').innerText = err;
    document.getElementById('progressBar').max = listaCNPJs.length;
    document.getElementById('progressBar').value = indiceAtual;
    
    document.getElementById('restoreArea').style.display = 'none';
    continuar();
};

// ==========================================
// 4. MOTOR DE PROCESSAMENTO
// ==========================================
window.pausar = () => {
    processando = false;
    document.getElementById('statusMsg').innerText = "Parando...";
};

window.continuar = () => {
    errosSeguidos = 0;
    rodarProcesso();
};

async function rodarProcesso() {
    processando = true;
    document.getElementById('btnPausar').style.display = 'block';
    document.getElementById('btnContinuarArea').style.display = 'none';
    document.getElementById('exportArea').style.display = 'flex';

    const elMsg = document.getElementById('statusMsg');
    const elSuc = document.getElementById('txtSucesso');
    const elErr = document.getElementById('txtErro');
    const elTotal = document.getElementById('txtTotal');

    for (let i = indiceAtual; i < listaCNPJs.length; i++) {
        if (!processando) {
            elMsg.innerText = "Pausado pelo usuário.";
            ativarModoPausa();
            break;
        }

        if (errosSeguidos >= LIMITE_ERRO) {
            processando = false;
            alert("⚠️ Pausa de Segurança: Muitos erros seguidos.");
            ativarModoPausa();
            break;
        }

        const cnpjLimpo = listaCNPJs[i].replace(/\D/g, '');
        elMsg.innerText = `Processando ${i + 1} (Tentando API MinhaReceita)...`;

        if (!validarMatematicaCNPJ(cnpjLimpo)) {
            resultados.push({ cnpj: cnpjLimpo, status: "ERRO", motivo: "CNPJ Inválido" });
            elErr.innerText = parseInt(elErr.innerText) + 1;
        } else {
            const dados = await consultarAPI(cnpjLimpo);
            resultados.push(dados);
            
            if (dados.status === "SUCESSO") {
                errosSeguidos = 0;
                elSuc.innerText = parseInt(elSuc.innerText) + 1;
            } else {
                errosSeguidos++;
                elErr.innerText = parseInt(elErr.innerText) + 1;
            }
        }

        indiceAtual = i + 1;
        elTotal.innerText = `${indiceAtual} / ${listaCNPJs.length}`;
        document.getElementById('progressBar').value = indiceAtual;

        if (i % 10 === 0) salvarProgresso();

        // Delay um pouco maior (800ms) pois a API MinhaReceita é mais sensível
        const delay = resultados[resultados.length-1].status === "ERRO" ? 100 : 800;
        await new Promise(r => setTimeout(r, delay));
    }

    if (indiceAtual >= listaCNPJs.length) {
        processando = false;
        elMsg.innerText = "Concluído!";
        document.getElementById('btnPausar').style.display = 'none';
        limparSessao();
    }
}

// ==========================================
// 5. NOVA CONSULTA DE API (MinhaReceita.org)
// ==========================================
async function consultarAPI(cnpj) {
    try {
        // TROCAMOS A URL AQUI PARA MINHARECEITA (Mais dados de contato)
        const res = await fetch(`https://minhareceita.org/${cnpj}`);
        
        if (res.status === 429) return { cnpj, status: "ERRO", motivo: "Rate Limit (429)" };
        if (!res.ok) return { cnpj, status: "ERRO", motivo: "Não encontrado" };
        
        const json = await res.json();

        // Formatar Telefone
        let telFormatado = "---";
        if (json.ddd_telefone_1) {
            const raw = json.ddd_telefone_1.replace(/\D/g, '');
            if (raw.length === 11) telFormatado = `(${raw.slice(0,2)}) ${raw.slice(2,7)}-${raw.slice(7)}`;
            else if (raw.length === 10) telFormatado = `(${raw.slice(0,2)}) ${raw.slice(2,6)}-${raw.slice(6)}`;
            else telFormatado = json.ddd_telefone_1;
        }

        // Formatar Email (Garante que pegue ou email ou correio_eletronico)
        let emailFinal = "---";
        if (json.email) {
            emailFinal = json.email.toLowerCase();
        } else if (json.correio_eletronico) {
            emailFinal = json.correio_eletronico.toLowerCase();
        }

        // Se veio "null" string ou vazio, marca explicitamente
        if (!emailFinal || emailFinal === "null") emailFinal = "---";

        return { 
            status: "SUCESSO", 
            // Forçamos o E-mail e Telefone a serem as primeiras colunas
            CNPJ: json.cnpj,
            EMAIL_FINAL: emailFinal, 
            TELEFONE_PRINCIPAL: telFormatado,
            Razao_Social: json.razao_social,
            Nome_Fantasia: json.nome_fantasia || "---",
            Logradouro: `${json.logradouro || ''}, ${json.numero || ''}`,
            Bairro: json.bairro || '',
            Cidade: json.municipio || '',
            UF: json.uf || '',
            CEP: json.cep || '',
            Situacao: json.descricao_situacao_cadastral || '',
            Data_Abertura: json.data_inicio_atividade || ''
        };

    } catch (e) {
        return { cnpj, status: "ERRO", motivo: "Erro Rede" };
    }
}

function ativarModoPausa() {
    document.getElementById('btnPausar').style.display = 'none';
    document.getElementById('btnContinuarArea').style.display = 'block';
    salvarProgresso();
}

window.baixarExcel = () => {
    if (!resultados.length) return alert("Sem dados");
    const ws = XLSX.utils.json_to_sheet(resultados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    XLSX.writeFile(wb, "CNPJ_Completo.xlsx");
};

window.baixarJSON = () => {
    if (!resultados.length) return alert("Sem dados");
    const blob = new Blob([JSON.stringify(resultados, null, 2)], {type: "application/json"});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "CNPJ_Completo.json";
    link.click();
};