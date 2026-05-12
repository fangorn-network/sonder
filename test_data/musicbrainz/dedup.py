import json

INPUT_FILE = 'raw.json'
OUTPUT_FILE = 'raw_clean.json'

def remove_duplicate_names(input_path, output_path):
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if not isinstance(data, list):
            print("Error: JSON root is not a list/array.")
            return

        seen_names = set()
        clean_data = []
        duplicate_count = 0

        for item in data:
            name = item.get('name')
            
            # If name is not in our set, it's the first time we've seen it
            if name not in seen_names:
                clean_data.append(item)
                seen_names.add(name)
            else:
                duplicate_count += 1

        # Write the cleaned list back to a new file
        with open(output_path, 'w', encoding='utf-8') as f:
            # indent=4 makes it readable in VS Code again
            json.dump(clean_data, f, indent=4, ensure_ascii=False)

        print(f"Success!")
        print(f"Removed {duplicate_count} duplicate items.")
        print(f"Cleaned file saved as: {output_path}")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    remove_duplicate_names(INPUT_FILE, OUTPUT_FILE)