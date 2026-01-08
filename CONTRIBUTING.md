# Contributing Guidelines

Thank you for your interest in contributing to our project. Whether it's a bug report, new feature, correction, or additional
documentation, we greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary
information to effectively respond to your bug report or contribution.


## Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check existing open, or recently closed, issues to make sure somebody else hasn't already
reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

* A reproducible test case or series of steps
* The version of our code being used
* Any modifications you've made relevant to the bug
* Anything unusual about your environment or deployment


## Code of Conduct
This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.


## Security issue notifications
If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public github issue.

## Authentication and Access Control

This repository implements the following authentication and access control measures to ensure system security:

### GitHub Actions Workflows
- **Authentication Requirement**: All automated workflows require GitHub authentication to execute
- **Owner Verification**: `workflow_dispatch` triggered workflows verify the actor is the repository owner
- **Comment Validation**: Issue comment workflows validate the commenter's GitHub identity and authorization level
- **Least Privilege**: Workflow permissions follow the principle of least privilege with minimal required scopes

### Repository Access
- **Branch Protection**: The main branch requires pull request reviews from code owners before merging
- **CODEOWNERS**: All code changes require review and approval from designated maintainers
- **Token Management**: GitHub tokens used in workflows are scoped to minimum required permissions

### User Authentication
- GitHub OAuth authentication is required for all users interacting with this repository
- Users must have a verified GitHub account to participate
- API calls are authenticated using GitHub tokens with appropriate scopes


