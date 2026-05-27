# Local Development Setup

To run the project locally, you need **3 running terminals** for the frontend, backend, and database.

## Frontend
1. cd frontend
2. npm install
3. npx expo start --web

Note: Ensure you have a .env file in the frontend folder, and have an IP_ADDR variable storing your machine's IP address

## Backend 

create `env.properties` file in backend folder

```
DB_URL=jdbc:postgresql://localhost:5432/pingan_mobile_app
DB_USER=pingan_mobile_app_user
DB_PASSWORD=PinganMobileApp@2026
IP_ADDR=<ip-address-of-your-machine>
```

1. cd backend
2. mvn spring-boot:run

Note: Ensure "java -version" and "mvn -version" report back the same version of Java. For some reason, Java 24 and Lombok 1.18.38 are not compatible with each other thus causing build failures.

## Database
The app reuses the existing PostgreSQL instance from the external Docker network `pingan-db-net`.
Create `infra/.env` with the PostgreSQL connection settings, then use docker cli / Open docker desktop:

1. docker-compose up -d

## Host Frontend on school server
1. docker build -t frontend-aws .
2. sudo docker run -it \
  -p 19000:19000 \
  -p 19001:19001 \
  -p 19002:19002 \
  --name fypfrontend \
  frontend-aws
3. Login with crediential ( in the fyp server terminal)
4. username: pinganservice572@gmail.com
5. pw: @7y4hidT73!ef)$

For using Docker images:
1. docker build -t frontendaws .    [local laptop]   
2. docker tag frontendaws pinganapp/frontendaws:v1 [local laptop]
1. docker pull pinganapp/frontendaws:v1
2. sudo docker run -it \
  -p 19000:19000 \
  -p 19001:19001 \
  -p 19002:19002 \
  --name frontendawsv2 \
  pinganapp/frontendaws:v1
3. Login with crediential ( in the fyp server terminal)
4. username: pinganservice572@gmail.com
5. pw: @7y4hidT73!ef)$




## Access Admin Page
Seed the admin account with the Compose tool:

```
docker compose --env-file infra/.env --profile tools run --rm --build seed-admin
```

The tool is idempotent: it creates the admin user if missing, promotes/verifies an existing user with the same email, and only resets the password when `APP_SEED_ADMIN_RESET_PASSWORD=true`.

Configure the seed account in `infra/.env`:

```
APP_SEED_ADMIN_EMAIL=admin@gmail.com
APP_SEED_ADMIN_PASSWORD=12345678
APP_SEED_ADMIN_FIRST_NAME=John
APP_SEED_ADMIN_LAST_NAME=Cena
APP_SEED_ADMIN_RESET_PASSWORD=false
```

Login to admin account in frontend:
USERNAME: admin@gmail.com
PW:12345678

## Push local docker images to public
cd to backend first
the following commands are
1. docker login
2. docker buildx build --platform linux/arm64 -t pinganapp/backendaws:v2 .  
4. docker push  pinganapp/backendaws:v2
5. docker pull pinganapp/backendaws:v2 [in ec2]
6.docker run -d --name backendaws --network fyp-pinganv2-working_default -p 8080:8080 pinganapp/backendaws:v2

note :v2 is the tag, so update accordingly when updating the version (v2,v3)


## School Server
1. use school vpn (global protect)
2. ssh FYP@10.96.176.192
3. Pw: 123qweQ!

## Libre
docker run -d --name librefyp --network fyp-pinganv2-working_default -p 5000:5000 libretranslate/libretranslate --load-only en,zh

## Docker compose
docker build -t pinganapp/backendaws:v5 -t pinganapp/backendaws:latest .
docker push pinganapp/backendaws:v5
docker push pinganapp/backendaws:latest

docker compose pull backend && docker compose up -d backend

## Vercel
Build command: npx expo export --platform web
output directory: dist

