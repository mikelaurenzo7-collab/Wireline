import re
with open("server.ts", "r", encoding="utf-8") as f:
    for i, line in enumerate(f):
        if re.search(r'app\.(get|post|put|delete|patch|use)\(["\']/api/', line):
            print(f"{i+1}: {line.strip()}")
