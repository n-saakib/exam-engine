# Exam Engine - AWS SAA Question Set

A centralized repository for storing and managing exam questions for cloud certification exams, with a focus on AWS Solutions Architect Associate (SAA).

## Table of Contents

- [Project Overview](#project-overview)
- [Repository Structure](#repository-structure)
- [Adding New Question Sets](#adding-new-question-sets)
- [Question JSON Format](#question-json-format)
- [File Naming Conventions](#file-naming-conventions)
- [Examples](#examples)

## Project Overview

This repository serves as a structured question bank for cloud certification exams. Questions are organized hierarchically by:
- Cloud provider (e.g., AWS, Azure)
- Certification level (e.g., Solutions Architect Associate)
- Difficulty (Easy, Medium, Hard, Mock)

The `exam-paths.json` file provides a cascading dropdown navigation structure for frontend applications to dynamically load exam paths.

## Repository Structure

```
aws-saa-ques-set/
├── Exams/
│   └── Cloud/
│       └── AWS/
│           └── Solutions-Architect-Associate/
│               ├── Easy/          (Easy difficulty questions)
│               ├── Medium/        (Medium difficulty questions)
│               ├── Hard/          (Hard difficulty questions)
│               └── Mock/          (Full-length mock exams)
├── exam-paths.json                (Hierarchical navigation structure)
├── README.md                       (This file)
├── CLAUDE.md                       (Developer/AI assistant guidelines)
└── .gitignore                      (Git ignore rules)
```

## Adding New Question Sets

### Step 1: Create the Directory Structure

Navigate to the appropriate difficulty level directory:

```bash
# For AWS SAA Easy questions
cd Exams/Cloud/AWS/Solutions-Architect-Associate/Easy

# For a new provider/certification (example: Azure)
mkdir -p Exams/Cloud/Azure/Administrator/Easy
```

### Step 2: Create the Question JSON File

Create a new JSON file following the naming convention: `{provider}_{exam-code}_{topic}_{set-number}_{difficulty}.json`

Example: `aws_saa_iam_ec2_set1_easy.json`

### Step 3: Populate the Question File

Use the template structure below:

```json
{
  "setId": "550e8400-e29b-41d4-a716-446655440000",
  "setTitle": "IAM and EC2 Fundamentals - Set 1",
  "difficulty": "Easy",
  "questions": [
    {
      "id": 1,
      "questionText": "Which AWS service allows you to manage user access and encryption keys?",
      "options": {
        "A": "AWS Key Management Service (KMS)",
        "B": "AWS Identity and Access Management (IAM)",
        "C": "AWS Secrets Manager",
        "D": "AWS Certificate Manager"
      },
      "correctAnswer": "B",
      "explanations": {
        "A": {
          "description": "AWS Key Management Service (KMS)",
          "reason": "KMS is primarily for managing encryption keys, not user access management."
        },
        "B": {
          "description": "AWS Identity and Access Management (IAM)",
          "reason": "IAM is the correct service for managing users, groups, roles, and their permissions to access AWS resources."
        },
        "C": {
          "description": "AWS Secrets Manager",
          "reason": "Secrets Manager is used for storing database passwords, API keys, and other secrets."
        },
        "D": {
          "description": "AWS Certificate Manager",
          "reason": "Certificate Manager is used for provisioning and managing SSL/TLS certificates."
        }
      },
      "Tips": "Remember: IAM = Identity & Access Management. Think 'Users & Permissions'"
    }
  ]
}
```

### Step 4: Update exam-paths.json

If you added a **new difficulty level** or **new exam path**, update `exam-paths.json`:

```json
{
  "label": "Choose a domain for exam",
  "cloud": {
    "title": "Cloud Certificate Exams",
    "label": "Choose the cloud provider",
    "aws": {
      "title": "Amazon Web Services (AWS)",
      "label": "Choose a certification",
      "saa": {
        "title": "AWS Solutions Architect Associate",
        "label": "Choose difficulty level",
        "easy": {
          "title": "Easy",
          "quesPath": "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy"
        },
        "medium": {
          "title": "Medium",
          "quesPath": "Exams/Cloud/AWS/Solutions-Architect-Associate/Medium"
        }
        // ... add new difficulty levels here
      }
    }
  }
}
```

## Question JSON Format

Each question set JSON file must follow this exact structure:

### Root Level
- **setId** (string, UUID): Unique identifier for the entire question set
- **setTitle** (string): Human-readable title for the question set
- **difficulty** (string): One of `Easy`, `Medium`, `Hard`, or `Mock`
- **questions** (array): Array of question objects

### Question Object
- **id** (integer): Sequential question number within the set (1, 2, 3, ...)
- **questionText** (string): The actual exam question
- **options** (object): Contains keys A, B, C, D with option text
  - **A** (string): Option A text
  - **B** (string): Option B text
  - **C** (string): Option C text
  - **D** (string): Option D text
- **correctAnswer** (string): Single letter (A, B, C, or D)
- **explanations** (object): Contains A, B, C, D keys with explanation objects
  - **description** (string): Short label for the option
  - **reason** (string): Detailed explanation of why correct/incorrect
- **Tips** (string): Study tips, mnemonics, or memory aids for this question

## File Naming Conventions

Follow this naming pattern for question JSON files:

```
{provider}_{exam-code}_{topic}_{set-number}_{difficulty}.json
```

### Components:
- **provider**: Cloud provider code (aws, azure, gcp)
- **exam-code**: Certification code (saa = Solutions Architect Associate, dap = Developer Associate)
- **topic**: Primary topic covered (iam_ec2, networking, storage, etc.)
- **set-number**: Set number (set1, set2, set3)
- **difficulty**: Difficulty level (easy, medium, hard)

### Examples:
- `aws_saa_iam_ec2_set1_easy.json`
- `aws_saa_networking_set2_medium.json`
- `aws_saa_database_set3_hard.json`
- `aws_saa_exam_style_set1.json` (for Mock exams, omit difficulty in name)

## Examples

### Example 1: Adding Easy Questions for AWS SAA

1. Create file: `Exams/Cloud/AWS/Solutions-Architect-Associate/Easy/aws_saa_s3_basics_set2_easy.json`
2. Populate with S3 questions following the JSON format
3. All questions in this file should have `"difficulty": "Easy"`
4. Use a new UUID for `setId` (generate at [uuidgenerator.net](https://www.uuidgenerator.net/))

### Example 2: Adding a New Certification Level

1. Create directory: `Exams/Cloud/AWS/Developer-Associate/Easy`
2. Create question files: `aws_dap_*.json`
3. Update `exam-paths.json` to add the new certification under AWS:
   ```json
   "dap": {
     "title": "AWS Developer Associate",
     "label": "Choose difficulty level",
     "easy": {
       "title": "Easy",
       "quesPath": "Exams/Cloud/AWS/Developer-Associate/Easy"
     },
     // ... add other difficulties
   }
   ```

### Example 3: Adding a Completely New Cloud Provider

1. Create directory: `Exams/Cloud/Azure/Administrator/Easy`
2. Create question files: `azure_admin_*.json`
3. Update `exam-paths.json`:
   ```json
   "azure": {
     "title": "Microsoft Azure",
     "label": "Choose a certification",
     "admin": {
       "title": "Azure Administrator",
       "label": "Choose difficulty level",
       "easy": {
         "title": "Easy",
         "quesPath": "Exams/Cloud/Azure/Administrator/Easy"
       }
       // ... add other difficulties
     }
   }
   ```

## Best Practices

- ✅ Use clear, concise question text without ambiguity
- ✅ Provide detailed explanations for each option, not just "correct/incorrect"
- ✅ Include practical AWS use cases in explanations
- ✅ Add memorable tips or mnemonics in the Tips field
- ✅ Generate unique UUIDs for each new question set
- ✅ Use consistent JSON formatting (2-space indentation)
- ✅ Test your JSON for syntax errors before committing
- ❌ Don't create questions that are poorly worded or confusing
- ❌ Don't skip explanations or tips
- ❌ Don't reuse setIds across different question sets

## Quick Commands

```bash
# Validate JSON syntax
jq . Exams/Cloud/AWS/Solutions-Architect-Associate/Easy/*.json

# Count total questions
find Exams -name "*.json" -exec jq '.questions | length' {} + | awk '{s+=$1} END {print s}'

# List all question sets
find Exams -name "*.json" -type f | sort
```
