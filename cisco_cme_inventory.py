#!/usr/bin/env python3
import argparse
import csv
import json
import os
import re
import sys


class CiscoCMEParser:
    """Parser simples para arquivos de backup de Cisco Call Manager Express."""

    def __init__(self, text):
        self.lines = text.splitlines()
        self.voice_registers = []
        self.voice_register_dns = []
        self.ephone_dns = []
        self.ephones = []
        self.voice_register_max_dn = None
        self.voice_register_max_pool = None
        self.telephony_service_max_ephones = None
        self.telephony_service_max_dn = None
        self.parse()

    def _new_section(self, section_type, section_id, line_no):
        obj = {
            "section": section_type,
            "id": section_id,
            "line": line_no,
        }
        if section_type == "voice_register_pool":
            obj["pool"] = section_id
            obj["dn_id"] = None
            obj["register_type"] = None
            obj["mac_address"] = None
            obj["number"] = None
            obj["name"] = None
            obj["description"] = None
        elif section_type == "voice_register_dn":
            obj["number"] = None
            obj["label"] = None
            obj["name"] = None
            obj["pool"] = None
            obj["description"] = None
        elif section_type == "ephone_dn":
            obj["number"] = None
            obj["label"] = None
            obj["name"] = None
            obj["description"] = None
            obj["alerting_service"] = None
        elif section_type == "ephone":
            obj["mac_address"] = None
            obj["phone_type"] = None
            obj["buttons"] = []
            obj["button_targets"] = []
        return obj

    def parse(self):
        current_section = None
        current_obj = None

        for lineno, raw_line in enumerate(self.lines, start=1):
            line = raw_line.rstrip("\n")
            stripped = line.lstrip()
            if not stripped or stripped.startswith("!"):
                continue

            indent = len(line) - len(stripped)
            if indent == 0:
                current_section = None
                current_obj = None
                if match := re.match(r"^voice register pool\s+(\d+)\b", stripped, re.IGNORECASE):
                    current_section = "voice_register_pool"
                    current_obj = self._new_section(current_section, match.group(1), lineno)
                    self.voice_registers.append(current_obj)
                    continue
                if match := re.match(r"^voice register dn\s+(\d+)\b", stripped, re.IGNORECASE):
                    current_section = "voice_register_dn"
                    current_obj = self._new_section(current_section, match.group(1), lineno)
                    self.voice_register_dns.append(current_obj)
                    continue
                if match := re.match(r"^ephone-dn\s+(\d+)\b", stripped, re.IGNORECASE):
                    current_section = "ephone_dn"
                    current_obj = self._new_section(current_section, match.group(1), lineno)
                    self.ephone_dns.append(current_obj)
                    continue
                if match := re.match(r"^ephone\s+(\d+)\b", stripped, re.IGNORECASE):
                    current_section = "ephone"
                    current_obj = self._new_section(current_section, match.group(1), lineno)
                    self.ephones.append(current_obj)
                    continue
                if re.match(r"^voice register global\b", stripped, re.IGNORECASE):
                    current_section = "voice_register_global"
                    current_obj = None
                    continue
                if re.match(r"^telephony-service\b", stripped, re.IGNORECASE):
                    current_section = "telephony_service"
                    current_obj = None
                    continue
            elif current_section:
                parts = stripped.split()
                if not parts:
                    continue

                key = parts[0].lower()
                value = " ".join(parts[1:]).strip() if len(parts) > 1 else None

                if current_section == "voice_register_global":
                    if key == "max-dn" and value and value.isdigit():
                        self.voice_register_max_dn = int(value)
                    elif key == "max-pool" and value and value.isdigit():
                        self.voice_register_max_pool = int(value)
                    continue
                if current_section == "telephony_service":
                    if key == "max-ephones" and value and value.isdigit():
                        self.telephony_service_max_ephones = int(value)
                    elif key == "max-dn" and value and value.isdigit():
                        self.telephony_service_max_dn = int(value)
                    continue

                if current_obj is None:
                    continue

                if current_section == "voice_register_pool":
                    if key == "number":
                        current_obj["number"] = value
                        parsed = re.match(r"^(\d+)\s+dn\s+(\d+)$", value, re.IGNORECASE)
                        if parsed:
                            current_obj["dn_id"] = parsed.group(2)
                    elif key == "name":
                        current_obj["name"] = value
                    elif key == "type":
                        current_obj["register_type"] = value
                    elif key == "description":
                        current_obj["description"] = value
                    elif key == "id" and value.lower().startswith("mac "):
                        current_obj["mac_address"] = value[4:].strip()
                elif current_section == "ephone_dn":
                    if key == "number":
                        current_obj["number"] = value
                    elif key == "label":
                        current_obj["label"] = value
                    elif key == "name":
                        current_obj["name"] = value
                    elif key == "description":
                        current_obj["description"] = value
                    elif key == "alerting-service":
                        current_obj["alerting_service"] = value
                elif current_section == "ephone":
                    if key == "mac-address":
                        current_obj["mac_address"] = value
                    elif key == "type":
                        current_obj["phone_type"] = value
                    elif key == "button" and value is not None:
                        current_obj["buttons"].append(value)
                        match = re.search(r":(\d+)$", value)
                        if match:
                            current_obj["button_targets"].append(match.group(1))
                elif current_section == "voice_register_dn":
                    if key == "number":
                        current_obj["number"] = value
                    elif key == "label":
                        current_obj["label"] = value
                    elif key == "name":
                        current_obj["name"] = value
                    elif key == "pool":
                        current_obj["pool"] = value
                    elif key == "description":
                        current_obj["description"] = value

    def inventory_rows(self):
        rows = []
        pool_info = {pool["pool"]: pool for pool in self.voice_registers}
        ephone_info = {}
        for phone in self.ephones:
            const_model = phone.get("phone_type")
            const_mac = phone.get("mac_address")
            for target in phone.get("button_targets", []):
                if not target:
                    continue
                entry = ephone_info.setdefault(target, {"models": set(), "macs": set()})
                if const_model:
                    entry["models"].add(const_model)
                if const_mac:
                    entry["macs"].add(const_mac)

        for dn in self.voice_register_dns:
            pool_id = dn.get("pool") or dn.get("id") or ""
            pool = pool_info.get(pool_id)
            if pool_id:
                pool_status = "ok" if pool else "missing pool"
            else:
                pool_status = "missing pool id"
            rows.append(
                {
                    "number": dn.get("number") or "",
                    "source": "voice register",
                    "id": dn.get("id", ""),
                    "name": dn.get("name", ""),
                    "label": dn.get("label", ""),
                    "type": "",
                    "model": pool.get("register_type", "") if pool else "",
                    "mac": pool.get("mac_address", "") if pool else "",
                    "pool": pool_id,
                    "pool_status": pool_status,
                    "description": dn.get("description", ""),
                }
            )
        for dn in self.ephone_dns:
            info = ephone_info.get(dn.get("id", ""), {"models": set(), "macs": set()})
            rows.append(
                {
                    "number": dn.get("number") or "",
                    "source": "ephone-dn",
                    "id": dn.get("id", ""),
                    "name": dn.get("name", ""),
                    "label": dn.get("label", ""),
                    "type": "",
                    "model": ", ".join(sorted(info["models"])) if info["models"] else "",
                    "mac": ", ".join(sorted(info["macs"])) if info["macs"] else "",
                    "pool": "",
                    "pool_status": "",
                    "description": dn.get("description", ""),
                }
            )
        return sorted(rows, key=lambda r: (int(r["number"]) if r["number"].isdigit() else float("inf"), r["number"]))

    def to_json(self):
        return json.dumps(self.inventory_rows(), indent=2, ensure_ascii=False)

    def stats(self):
        return {
            "voice_register_dns": len(self.voice_register_dns),
            "voice_register_max_dn": self.voice_register_max_dn,
            "voice_register_max_pool": self.voice_register_max_pool,
            "ephone_dns": len(self.ephone_dns),
            "ephone_devices": len(self.ephones),
            "telephony_service_max_ephones": self.telephony_service_max_ephones,
            "telephony_service_max_dn": self.telephony_service_max_dn,
        }


def print_table(rows):
    headers = ["number", "source", "id", "name", "label", "type", "model", "mac", "pool", "pool_status", "description"]
    widths = {header: len(header) for header in headers}
    for row in rows:
        for header in headers:
            widths[header] = max(widths[header], len(str(row.get(header, ""))))

    header_line = "  ".join(header.ljust(widths[header]) for header in headers)
    separator = "  ".join("-" * widths[header] for header in headers)
    print(header_line)
    print(separator)
    for row in rows:
        print("  ".join(str(row.get(header, "")).ljust(widths[header]) for header in headers))


def write_csv(rows, path):
    headers = ["number", "source", "id", "name", "label", "type", "model", "mac", "pool", "pool_status", "description"]
    with open(path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Extrai inventário de ramais de um backup Cisco CME (voice register + ephone-dn)."
    )
    parser.add_argument("backup_file", help="Arquivo de backup/configuração do Cisco CME")
    parser.add_argument(
        "-f",
        "--format",
        choices=["table", "json", "csv"],
        default="table",
        help="Formato de saída (table, json, csv)",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Arquivo de saída para JSON ou CSV. Sem parâmetro, imprime no stdout.",
    )
    return parser.parse_args()


def load_file(path):
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Arquivo não encontrado: {path}")
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def main():
    args = parse_arguments()
    try:
        text = load_file(args.backup_file)
    except FileNotFoundError as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)

    parser = CiscoCMEParser(text)
    rows = parser.inventory_rows()

    if args.format == "json":
        output = parser.to_json()
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output)
        else:
            print(output)
    elif args.format == "csv":
        if args.output:
            write_csv(rows, args.output)
        else:
            writer = csv.DictWriter(
                sys.stdout,
                fieldnames=["number", "source", "id", "name", "label", "type", "model", "mac", "pool", "pool_status", "description"],
            )
            writer.writeheader()
            writer.writerows(rows)
    else:
        stats = parser.stats()
        voice_register_max = stats["voice_register_max_dn"] or stats["voice_register_max_pool"]
        if voice_register_max is not None:
            print(f"Voice register detectados: {stats['voice_register_dns']} de {voice_register_max}")
        else:
            print(f"Voice register detectados: {stats['voice_register_dns']}")

        if stats["telephony_service_max_ephones"] is not None:
            print(f"Ephone-dn detectados: {stats['ephone_dns']} de {stats['telephony_service_max_ephones']}")
        elif stats["telephony_service_max_dn"] is not None:
            print(f"Ephone-dn detectados: {stats['ephone_dns']} de {stats['telephony_service_max_dn']}")
        else:
            print(f"Ephone-dn detectados: {stats['ephone_dns']}")

        print_table(rows)


if __name__ == "__main__":
    main()
