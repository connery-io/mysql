bucket         = "connery-terraform-remote-state-np"
key            = "mysql/v1/terraform.tfstate"
region         = "eu-central-1"
encrypt        = true
dynamodb_table = "connery-terraform-statelock"