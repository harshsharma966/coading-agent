import os
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from vector_db import vector_db


# Folder jiska code ingest karna hai
CODEBASE_PATH = "../"


# Code file extensions
SUPPORTED_EXTENSIONS = (
    ".py",
    ".js",
    ".ts",
    ".java",
    ".cpp",
    ".c",
)


documents = []


# Read all files
for root, dirs, files in os.walk(CODEBASE_PATH):

    # Ignore unnecessary folders
    dirs[:] = [
        d for d in dirs
        if d not in [
            "venv",
            "__pycache__",
            ".git",
            "node_modules"
        ]
    ]

    for file in files:

        if file.endswith(SUPPORTED_EXTENSIONS):

            file_path = os.path.join(root, file)

            try:

                with open(
                    file_path,
                    "r",
                    encoding="utf-8"
                ) as f:

                    content = f.read()


                documents.append(
                    Document(
                        page_content=content,
                        metadata={
                            "file_path": file_path
                        }
                    )
                )

            except Exception as e:

                print(
                    f"Error reading {file_path}: {e}"
                )


# Split code into chunks
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200
)


chunks = text_splitter.split_documents(
    documents
)


# Store chunks in pgvector
vector_db.add_documents(
    chunks
)


print(
    f"Successfully stored {len(chunks)} chunks"
)