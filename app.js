const dom = {
  inputFile: document.getElementById("inputFile"),
  fileName: document.getElementById("fileName"),
  lineCount: document.getElementById("lineCount"),
  itemCount: document.getElementById("itemCount"),
  voiceRegisterCount: document.getElementById("voiceRegisterCount"),
  ephoneDnCount: document.getElementById("ephoneDnCount"),
  sources: document.getElementById("sources"),
  inventoryTableBody: document.querySelector("#inventoryTable tbody"),
  jsonOutput: document.getElementById("jsonOutput"),
  downloadCsv: document.getElementById("downloadCsv"),
  downloadJson: document.getElementById("downloadJson"),
  copyJson: document.getElementById("copyJson"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  ddrStart: document.getElementById("ddrStart"),
  ddrEnd: document.getElementById("ddrEnd"),
  addDdrRange: document.getElementById("addDdrRange"),
  ddrRangesList: document.getElementById("ddrRangesList"),
};

const state = {
  allInventory: [],
  currentInventory: [],
  currentText: "",
  ddrRanges: [],
};

dom.inputFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  dom.fileName.textContent = file.name;
  state.currentText = await file.text();
  const parsed = parseCiscoCmeBackup(state.currentText);
  renderInventory(parsed);
});

dom.searchInput.addEventListener("input", applyFiltersAndSort);
dom.sortSelect.addEventListener("change", applyFiltersAndSort);
dom.addDdrRange.addEventListener("click", () => {
  const start = Number(dom.ddrStart.value);
  const end = Number(dom.ddrEnd.value);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    alert("Informe valores numéricos válidos para início e fim da faixa DDR.");
    return;
  }
  if (start > end) {
    alert("O início da faixa DDR deve ser menor ou igual ao fim.");
    return;
  }
  state.ddrRanges.push({ start, end });
  dom.ddrStart.value = "";
  dom.ddrEnd.value = "";
  renderDdrRanges();
  applyFiltersAndSort();
});

function parseCiscoCmeBackup(text) {
  const lines = text.split(/\r?\n/);
  const voiceRegisters = [];
  const voiceRegisterDns = [];
  const ephoneDns = [];
  const ephones = [];

  let currentSection = null;
  let currentObj = null;

  for (let rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const stripped = line.trimStart();
    if (!stripped || stripped.startsWith("!")) {
      continue;
    }

    const indent = line.length - stripped.length;
    if (indent === 0) {
      currentSection = null;
      currentObj = null;

      const registerMatch = stripped.match(/^voice register pool\s+(\d+)\b/i);
      const registerDnMatch = stripped.match(/^voice register dn\s+(\d+)\b/i);
      const ephoneDnMatch = stripped.match(/^ephone-dn\s+(\d+)\b/i);
      const ephoneMatch = stripped.match(/^ephone\s+(\d+)\b/i);

      if (registerMatch) {
        currentSection = "voice_register_pool";
        currentObj = {
          section: currentSection,
          pool: registerMatch[1],
          number: "",
          name: "",
          register_type: "",
          description: "",
          mac_address: "",
        };
        voiceRegisters.push(currentObj);
        continue;
      }

      if (registerDnMatch) {
        currentSection = "voice_register_dn";
        currentObj = {
          section: currentSection,
          id: registerDnMatch[1],
          number: "",
          name: "",
          label: "",
          pool: "",
          description: "",
        };
        voiceRegisterDns.push(currentObj);
        continue;
      }

      if (ephoneDnMatch) {
        currentSection = "ephone_dn";
        currentObj = {
          section: currentSection,
          id: ephoneDnMatch[1],
          number: "",
          label: "",
          name: "",
          description: "",
          alerting_service: "",
        };
        ephoneDns.push(currentObj);
        continue;
      }

      if (ephoneMatch) {
        currentSection = "ephone";
        currentObj = {
          section: currentSection,
          id: ephoneMatch[1],
          mac_address: "",
          type: "",
          buttons: [],
          buttonTargets: [],
        };
        ephones.push(currentObj);
        continue;
      }
    } else if (currentSection && currentObj) {
      const [key, ...rest] = stripped.split(/\s+/);
      const value = rest.join(" ").trim();
      const lowerKey = key.toLowerCase();

      if (currentSection === "voice_register_pool") {
        if (lowerKey === "number") {
          currentObj.number = value;
        } else if (lowerKey === "name") {
          currentObj.name = value;
        } else if (lowerKey === "type") {
          currentObj.register_type = value;
        } else if (lowerKey === "description") {
          currentObj.description = value;
        } else if (lowerKey === "id" && value.toLowerCase().startsWith("mac ")) {
          currentObj.mac_address = value.slice(4).trim();
        }
      }

      if (currentSection === "voice_register_dn") {
        if (lowerKey === "number") {
          currentObj.number = value;
        } else if (lowerKey === "name") {
          currentObj.name = value;
        } else if (lowerKey === "label") {
          currentObj.label = value;
        } else if (lowerKey === "pool") {
          currentObj.pool = value;
        } else if (lowerKey === "description") {
          currentObj.description = value;
        }
      }

      if (currentSection === "ephone_dn") {
        if (lowerKey === "number") {
          currentObj.number = value;
        } else if (lowerKey === "label") {
          currentObj.label = value;
        } else if (lowerKey === "name") {
          currentObj.name = value;
        } else if (lowerKey === "description") {
          currentObj.description = value;
        } else if (lowerKey === "alerting-service") {
          currentObj.alerting_service = value;
        }
      }

      if (currentSection === "ephone") {
        if (lowerKey === "mac-address") {
          currentObj.mac_address = value;
        } else if (lowerKey === "type") {
          currentObj.type = value;
        } else if (lowerKey === "button") {
          currentObj.buttons.push(value);
          const match = value.match(/:(\d+)$/);
          if (match) {
            currentObj.buttonTargets.push(match[1]);
          }
        }
      }
    }
  }

  const rows = [];
  const ephoneModelByDnId = {};
  const ephoneMacByDnId = {};
  ephones.forEach((phone) => {
    const model = phone.type || "";
    const mac = phone.mac_address || "";
    phone.buttonTargets.forEach((target) => {
      if (!target) {
        return;
      }
      if (!ephoneModelByDnId[target]) {
        ephoneModelByDnId[target] = new Set();
      }
      if (!ephoneMacByDnId[target]) {
        ephoneMacByDnId[target] = new Set();
      }
      if (model) {
        ephoneModelByDnId[target].add(model);
      }
      if (mac) {
        ephoneMacByDnId[target].add(mac);
      }
    });
  });

  const poolInfo = Object.fromEntries(voiceRegisters.map((reg) => [reg.pool, reg]));

  let maxVoiceRegisterDn = null;
  let maxVoiceRegisterPool = null;
  let maxTelephonyEphones = null;
  let maxTelephonyDn = null;

  let currentScope = null;
  for (let rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("!")) continue;

    const indent = line.length - line.trimStart().length;
    if (/^voice register global\b/i.test(stripped)) {
      currentScope = "voice_register_global";
      continue;
    }
    if (/^telephony-service\b/i.test(stripped)) {
      currentScope = "telephony_service";
      continue;
    }

    if (indent === 0 && !/^voice register global\b/i.test(stripped) && !/^telephony-service\b/i.test(stripped)) {
      currentScope = null;
    }

    if (currentScope === "voice_register_global") {
      const matchMaxDn = stripped.match(/^max-dn\s+(\d+)/i);
      const matchMaxPool = stripped.match(/^max-pool\s+(\d+)/i);
      if (matchMaxDn) {
        maxVoiceRegisterDn = Number(matchMaxDn[1]);
      }
      if (matchMaxPool) {
        maxVoiceRegisterPool = Number(matchMaxPool[1]);
      }
    }
    if (currentScope === "telephony_service") {
      const matchMaxEphones = stripped.match(/^max-ephones\s+(\d+)/i);
      const matchMaxDn = stripped.match(/^max-dn\s+(\d+)/i);
      if (matchMaxEphones) {
        maxTelephonyEphones = Number(matchMaxEphones[1]);
      }
      if (matchMaxDn) {
        maxTelephonyDn = Number(matchMaxDn[1]);
      }
    }
  }

  const stats = {
    voiceRegisterMaxDn: maxVoiceRegisterDn,
    voiceRegisterMaxPool: maxVoiceRegisterPool,
    telephonyMaxEphones: maxTelephonyEphones,
    telephonyMaxDn: maxTelephonyDn,
    voiceRegisterCount: voiceRegisterDns.length,
    ephoneDnCount: ephoneDns.length,
  };

  voiceRegisterDns.forEach((dn) => {
    const poolId = dn.pool || dn.id;
    const pool = poolInfo[poolId];
    const poolStatus = poolId ? (pool ? "ok" : "missing pool") : "missing pool id";
    rows.push({
      number: dn.number || "",
      source: "voice register",
      id: dn.id,
      name: dn.name,
      label: dn.label,
      type: "",
      model: pool?.register_type || "",
      mac: pool?.mac_address || "",
      pool: poolId || "",
      pool_status: poolStatus,
      description: dn.description,
    });
  });

  ephoneDns.forEach((dn) => {
    const models = ephoneModelByDnId[dn.id];
    const macs = ephoneMacByDnId[dn.id];
    rows.push({
      number: dn.number || "",
      source: "ephone",
      id: dn.id,
      name: dn.name,
      label: dn.label,
      type: "",
      model: models ? Array.from(models).sort().join(", ") : "",
      mac: macs ? Array.from(macs).sort().join(", ") : "",
      description: dn.description,
    });
  });

  rows.sort((a, b) => {
    const numA = Number(a.number);
    const numB = Number(b.number);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
    return a.number.localeCompare(b.number, undefined, { numeric: true });
  });

  return {
    rows,
    lines: lines.length,
    sources: [...new Set(rows.map((row) => row.source))],
    stats: {
      voiceRegisterMaxDn: maxVoiceRegisterDn,
      voiceRegisterMaxPool: maxVoiceRegisterPool,
      telephonyMaxEphones: maxTelephonyEphones,
      telephonyMaxDn: maxTelephonyDn,
      voiceRegisterCount: voiceRegisterDns.length,
      ephoneDnCount: ephoneDns.length,
    },
  };
}

function getDdrStatus(number) {
  if (!state.ddrRanges.length) {
    return "";
  }
  const value = Number(number);
  if (!Number.isInteger(value)) {
    return "DDR - Não";
  }
  const match = state.ddrRanges.some((range) => value >= range.start && value <= range.end);
  return match ? "DDR - Sim" : "DDR - Não";
}

function renderDdrRanges() {
  if (!state.ddrRanges.length) {
    dom.ddrRangesList.textContent = "Nenhuma faixa adicionada";
    return;
  }
  dom.ddrRangesList.innerHTML = "";
  state.ddrRanges.forEach((range, index) => {
    const rangeItem = document.createElement("div");
    rangeItem.className = "ddr-range-item";
    rangeItem.textContent = `${range.start} até ${range.end}`;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary small";
    removeButton.textContent = "Remover";
    removeButton.addEventListener("click", () => {
      state.ddrRanges.splice(index, 1);
      renderDdrRanges();
      applyFiltersAndSort();
    });
    rangeItem.appendChild(removeButton);
    dom.ddrRangesList.appendChild(rangeItem);
  });
}

function renderInventory(parsed) {
  state.allInventory = parsed.rows.map((row) => ({ ...row, ddr: getDdrStatus(row.number) }));
  dom.lineCount.textContent = parsed.lines;
  dom.sources.textContent = parsed.sources.join(", ");
  renderStats(parsed.stats);
  renderDdrRanges();
  applyFiltersAndSort();
  dom.downloadCsv.disabled = false;
  dom.downloadJson.disabled = false;
  dom.copyJson.disabled = false;
}

function renderStats(stats) {
  const voiceMax = stats.voiceRegisterMaxDn || stats.voiceRegisterMaxPool || 0;
  dom.voiceRegisterCount.textContent = `${stats.voiceRegisterCount} de ${voiceMax || "-"}`;
  const ephoneMax = stats.telephonyMaxEphones || stats.telephonyMaxDn || 0;
  dom.ephoneDnCount.textContent = `${stats.ephoneDnCount} de ${ephoneMax || "-"}`;
}

function applyFiltersAndSort() {
  const query = dom.searchInput.value.trim().toLowerCase();
  state.currentInventory = state.allInventory.filter((row) => {
    if (!query) {
      return true;
    }
    return (
      String(row.number).toLowerCase().includes(query) ||
      String(row.name || "").toLowerCase().includes(query) ||
      String(row.label || "").toLowerCase().includes(query)
    );
  });

  const sortKey = dom.sortSelect.value || "id";
  state.currentInventory = state.currentInventory.map((row) => ({ ...row, ddr: getDdrStatus(row.number) }));
  state.currentInventory.sort((a, b) => compareInventoryRows(a, b, sortKey));
  dom.itemCount.textContent = state.currentInventory.length;
  renderTable(state.currentInventory);
  renderJson(state.currentInventory);
}

function compareInventoryRows(a, b, key) {
  const valueA = a[key] || "";
  const valueB = b[key] || "";

  if (key === "id" || key === "number") {
    const numA = Number(valueA);
    const numB = Number(valueB);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
  }

  return String(valueA).localeCompare(String(valueB), undefined, { numeric: true, sensitivity: "base" });
}

function renderTable(rows) {
  dom.inventoryTableBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    ["number", "source", "ddr", "model", "mac", "pool", "pool_status", "id", "name", "label", "type", "description"].forEach((field) => {
      const td = document.createElement("td");
      td.textContent = row[field] || "";
      tr.appendChild(td);
    });
    dom.inventoryTableBody.appendChild(tr);
  });
}

function renderJson(rows) {
  dom.jsonOutput.textContent = JSON.stringify(rows, null, 2);
}

function buildCsv(rows) {
  const header = ["number", "source", "ddr", "model", "mac", "pool", "pool_status", "id", "name", "label", "type", "description"];
  const escapeValue = (value) => {
    if (value == null) return "";
    const text = String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push(header.map((field) => escapeValue(row[field])).join(","));
  });
  return lines.join("\n");
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

dom.downloadCsv.addEventListener("click", () => {
  const csv = buildCsv(state.currentInventory);
  downloadFile("inventario-cme.csv", csv, "text/csv;charset=utf-8;");
});

dom.downloadJson.addEventListener("click", () => {
  downloadFile("inventario-cme.json", JSON.stringify(state.currentInventory, null, 2), "application/json;charset=utf-8;");
});

dom.copyJson.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(state.currentInventory, null, 2));
    alert("JSON copiado para a área de transferência.");
  } catch (error) {
    alert("Não foi possível copiar. Use o botão de download para salvar o JSON.");
  }
});
if (!window.FileReader) {
  alert("Seu navegador não suporta leitura de arquivos locais. Use um navegador atualizado.");
}
