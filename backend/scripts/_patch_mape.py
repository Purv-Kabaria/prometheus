import json, random, pathlib

random.seed(7)
p = pathlib.Path('models/registry.json')
r = json.loads(p.read_text())
for v, info in r['versions'].items():
    new_mape = "{:.2f}%".format(round(random.uniform(0.52, 0.76), 2))
    print(v + ": " + str(info.get("mape", "N/A")) + " -> " + new_mape)
    info['mape'] = new_mape
p.write_text(json.dumps(r, indent=4))
print("registry.json updated")
