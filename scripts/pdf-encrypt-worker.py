import json
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions


def encrypted_writer(reader, pages, password):
    writer = PdfWriter()
    for index in pages:
        writer.add_page(reader.pages[index])
    permissions = (
        UserAccessPermissions.PRINT
        | UserAccessPermissions.PRINT_TO_REPRESENTATION
    )
    writer.encrypt(
        user_password="",
        owner_password=password,
        permissions_flag=permissions,
        algorithm="AES-256-R5",
    )
    return writer


for line in sys.stdin:
    try:
        request = json.loads(line)
        reader = PdfReader(request["source"])
        if not reader.pages:
            raise ValueError("The generated PDF has no pages.")

        full = encrypted_writer(reader, range(len(reader.pages)), request["password"])
        with open(request["full"], "wb") as output:
            full.write(output)

        sample = encrypted_writer(reader, [0], request["password"])
        with open(request["sample"], "wb") as output:
            sample.write(output)

        print(json.dumps({"ok": True, "pages": len(reader.pages)}), flush=True)
    except Exception as error:
        print(json.dumps({"ok": False, "message": str(error)}), flush=True)
