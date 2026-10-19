from vector_db import vector_db


def retrieve_code(query: str, k: int = 3):

    results = vector_db.similarity_search(
        query,
        k=k
    )

    return results



if __name__ == "__main__":

    results = retrieve_code(
        "How does memory work?"
    )

    for result in results:

        print("\nFILE:")
        print(result.metadata.get("file_path"))

        print("\nCONTENT:")
        print(result.page_content)

        print("-" * 50)