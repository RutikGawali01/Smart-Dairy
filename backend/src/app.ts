import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression"; 
import cookieParser from "cookie-parser";
import hpp from "hpp";
import morgan from "morgan";
import routes from "./routes/index.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import errorMiddleware from "./middleware/error.middleware.js";

const app = express();
  
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()) : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error(`CORS policy blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.use(cookieParser());

app.use(helmet());

app.use(compression());

app.use(morgan("dev"));



app.use(hpp());

app.use(apiLimiter);

app.get("/", (req, res) => {
  res.send("Dairy API Running");
});

app.use("/api/v1", routes);
app.use(errorMiddleware);

export default app;