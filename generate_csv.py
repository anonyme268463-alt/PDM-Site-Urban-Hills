import json
import csv

try:
    with open('vehicles_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    headers = ["Marque", "Modèle", "Type", "Classe", "Prix", "Places", "Vitesse Max", "URL Image"]

    with open('vehicles_export.csv', 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for v in data:
            writer.writerow([
                v.get('brand', ''),
                v.get('model', ''),
                v.get('type', ''),
                v.get('classe', ''),
                v.get('price', 0),
                v.get('places', 0),
                v.get('vitessemax', 0),
                v.get('urlimagevehicule', '')
            ])
    print("CSV generated: vehicles_export.csv")
except Exception as e:
    print(f"Error: {e}")
