from setuptools import setup, find_packages

setup(
    name="kiro-commit-generator-mcp",
    version="1.0.0",
    description="AI-powered commit message generator MCP server for Kiro IDE",
    author="Tim Wu",
    author_email="timwukp@github.com",
    url="https://github.com/timwukp/Kiro",
    py_modules=["kiro-commit-generator-mcp"],
    install_requires=[
        "fastmcp>=0.1.0",
    ],
    entry_points={
        "console_scripts": [
            "kiro-commit-generator=kiro-commit-generator-mcp:main",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
)