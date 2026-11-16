import base64
from pathlib import Path

import pytest

from app import ai_runner, catalog

SAMPLE = Path(__file__).with_name("products-sample.xlsx").read_bytes()


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def test_reads_the_sample_excel():
    products, columns, skipped = catalog.parse_file("Products.xlsx", SAMPLE)
    assert len(products) == 10 and skipped == []
    assert products[1] == {"code": "P002", "name": "Slim Fit Denim Jeans", "price": 1299, "details": {"Sizes": "30, 32, 34, 36", "Colours": "Dark blue", "Details": "Stretch denim", "Stock": "30"}}
    assert columns == ["Sizes", "Colours", "Details", "Stock"]


def test_reads_csv_with_other_header_names_and_skips_bad_rows():
    data = "SKU;Product name;MRP (₹);Colour\nA1;Mug;₹ 249;Red\nA2;Plate;;Blue\na1;Duplicate;10;\n".encode()
    products, columns, skipped = catalog.parse_file("list.csv", data)
    assert products == [{"code": "A1", "name": "Mug", "price": 249, "details": {"Colour": "Red"}}]
    assert columns == ["Colour"] and skipped == [3, 4]


@pytest.mark.parametrize("name,data,msg", [
    ("x.xls", b"..", "save it as .xlsx"),
    ("x.pdf", b"..", "Excel"),
    ("x.xlsx", b"not a zip", "valid .xlsx"),
    ("x.csv", b"Name,Price\nMug,10\n", "column Code"),
    ("x.csv", b"Code,Name,Price\nA,B,0\n", "No product rows"),
])
def test_clear_errors(name, data, msg):
    with pytest.raises(catalog.CatalogError, match=msg):
        catalog.parse_file(name, data)


def test_import_api_roles_dry_run_and_replace(client, world):
    admin, agent = world.headers("admin_a"), world.headers("agent_a")
    body = {"file_name": "Products.xlsx", "content_base64": b64(SAMPLE)}
    assert client.post("/v1/catalog/import", json=body, headers=agent).status_code == 403
    dry = client.post("/v1/catalog/import", json={**body, "dry_run": True}, headers=admin).json()
    assert dry["count"] == 10 and not world.store.get("product_catalog")
    assert client.post("/v1/catalog/import", json=body, headers=admin).json()["count"] == 10
    got = client.get("/v1/catalog", headers=agent).json()
    assert got["file_name"] == "Products.xlsx" and len(got["products"]) == 10
    small = {"file_name": "two.csv", "content_base64": b64(b"Code,Name,Price\nX1,Cap,199\n")}
    client.post("/v1/catalog/import", json=small, headers=admin)
    assert len(world.rows("product_catalog")) == 1 and world.rows("product_catalog")[0]["products"][0]["code"] == "X1"
    bad = client.post("/v1/catalog/import", json={"file_name": "a.csv", "content_base64": b64(b"Name\nx\n")}, headers=admin)
    assert bad.status_code == 422 and "Code" in bad.json()["detail"]
    assert client.get("/v1/catalog", headers=world.headers("admin_b")).json() is None
    assert client.delete("/v1/catalog", headers=admin).status_code == 204 and world.rows("product_catalog") == []


def test_assistant_prompt_includes_the_product_list():
    products, _, _ = catalog.parse_file("Products.xlsx", SAMPLE)
    facts = catalog.as_facts(products)
    system = ai_runner.build_system({"name": "Shop", "_catalog": facts}, "jeans price?")
    assert "Code P002, Slim Fit Denim Jeans, ₹1,299. Sizes: 30, 32, 34, 36" in system and "P010" in system
    many = [{"q": f"C{i} Item {i}", "a": f"Code C{i}, Item {i}, ₹{i}."} for i in range(100)] + [{"q": "Z9 Denim jeans", "a": "Code Z9, Denim jeans, ₹999."}]
    narrowed = ai_runner.build_system({"name": "Shop", "_catalog": many}, "denim jeans")
    assert "Z9" in narrowed and "We sell 101 products" in narrowed and "C55" not in narrowed
