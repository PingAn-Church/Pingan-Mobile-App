# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install prerequisite packages
sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common

# Install Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Verify Docker installed correctly
docker --version

# Install Docker Compose plugin (Docker Compose v2)
sudo apt-get install -y docker-compose-plugin

# Verify docker-compose installed
docker compose version

# Enable and start Docker service
sudo systemctl enable docker
sudo systemctl start docker
