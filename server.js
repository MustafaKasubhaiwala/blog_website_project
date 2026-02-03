const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const JWT_SECRET = "blog_secret_key";


const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "9926662392mk",
  database: "blog_app_project"
});

db.connect(() => console.log("Connected to DB"));


function auth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login");
  req.user = jwt.verify(token, JWT_SECRET);
  next();
}

function writerOnly(req, res, next) {
  if (req.user.role === "writer" || req.user.role === "admin") next();
  else res.send("Not authorized");
}


app.get("/", (req, res) => res.redirect("/login"));

app.get("/register", (req, res) => res.render("register"));

app.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (e, r) => {
    if (r.length > 0) {
      return res.render("register", { error: "User already registered" });
    }

    const safeRole = role === "writer" ? "writer" : "user";
    const hash = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)",
      [name, email, hash, safeRole],
      () => res.redirect("/login")
    );
  });
});

app.get("/login", (req, res) => res.render("login"));

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (e, result) => {
    if (result.length === 0) {
      return res.render("login", {
        error: "User does not exist. Please register."
      });
    }

    const valid = await bcrypt.compare(password, result[0].password);
    if (!valid) {
      return res.render("login", {
        error: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      { user_id: result[0].user_id, role: result[0].role },
      JWT_SECRET
    );

    res.cookie("token", token);
    res.redirect("/dashboard");
  });
});

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});


app.get("/dashboard", auth, (req, res) => {
  db.query(
    `SELECT posts.*, users.name 
     FROM posts JOIN users ON posts.user_id = users.user_id
     WHERE status='published'`,
    (e, posts) => {
      res.render("dashboard", { posts, user: req.user });
    }
  );
});


app.get("/search", auth, (req, res) => {
  db.query(
    `SELECT posts.*, users.name 
     FROM posts JOIN users ON posts.user_id = users.user_id
     WHERE title LIKE ? AND status='published'`,
    [`%${req.query.q}%`],
    (e, posts) => {
      res.render("dashboard", { posts, user: req.user });
    }
  );
});


app.get("/post/new", auth, writerOnly, (req, res) =>
  res.render("createPost")
);

app.post("/post/new", auth, writerOnly, (req, res) => {
  db.query(
    "INSERT INTO posts (user_id,title,content,tags,status) VALUES (?,?,?,?,?)",
    [
      req.user.user_id,
      req.body.title,
      req.body.content,
      req.body.tags,
      req.body.status
    ],
    () => res.redirect("/dashboard")
  );
});

app.get("/post/edit/:id", auth, (req, res) => {
  db.query("SELECT * FROM posts WHERE post_id=?", [req.params.id], (e, r) => {
    if (r[0].user_id !== req.user.user_id && req.user.role !== "admin")
      return res.send("Unauthorized");
    res.render("editPost", { post: r[0] });
  });
});

app.post("/post/edit/:id", auth, (req, res) => {
  db.query(
    "UPDATE posts SET title=?, content=?, tags=? WHERE post_id=?",
    [req.body.title, req.body.content, req.body.tags, req.params.id],
    () => res.redirect("/dashboard")
  );
});

app.get("/post/delete/:id", auth, (req, res) => {
  if (req.user.role === "admin") {
    db.query("DELETE FROM posts WHERE post_id=?", [req.params.id]);
  } else {
    db.query(
      "DELETE FROM posts WHERE post_id=? AND user_id=?",
      [req.params.id, req.user.user_id]
    );
  }
  res.redirect("/dashboard");
});


app.get("/post/:id", auth, (req, res) => {
  db.query(
    `SELECT posts.*, users.name AS author
     FROM posts JOIN users ON posts.user_id=users.user_id
     WHERE post_id=?`,
    [req.params.id],
    (e, post) => {
      db.query(
        `SELECT comments.*, users.name
         FROM comments JOIN users ON comments.user_id=users.user_id
         WHERE post_id=?`,
        [req.params.id],
        (e, comments) => {
          res.render("post", {
            post: post[0],
            comments,
            user: req.user
          });
        }
      );
    }
  );
});

app.post("/comment/:id", auth, (req, res) => {
  db.query(
    "INSERT INTO comments (post_id,user_id,comment) VALUES (?,?,?)",
    [req.params.id, req.user.user_id, req.body.comment],
    () => res.redirect("/post/" + req.params.id)
  );
});

app.get("/comment/delete/:id", auth, (req, res) => {
  if (req.user.role === "admin") {
    db.query(
      "DELETE FROM comments WHERE comment_id=?",
      [req.params.id],
      () => res.redirect("back")
    );
  } else {
    db.query(
      "DELETE FROM comments WHERE comment_id=? AND user_id=?",
      [req.params.id, req.user.user_id],
      (e, r) => {
        if (r.affectedRows === 0) return res.send("Unauthorized");
        res.redirect("back");
      }
    );
  }
});

app.get("/comment/edit/:id", auth, (req, res) => {
  db.query(
    "SELECT * FROM comments WHERE comment_id=?",
    [req.params.id],
    (e, r) => {
      if (r[0].user_id !== req.user.user_id && req.user.role !== "admin")
        return res.send("Unauthorized");
      res.render("editComment", { comment: r[0] });
    }
  );
});

app.post("/comment/edit/:id", auth, (req, res) => {
  db.query(
    "UPDATE comments SET comment=? WHERE comment_id=? AND user_id=?",
    [req.body.comment, req.params.id, req.user.user_id],
    () => res.redirect("/post/" + req.body.post_id)
  );
});

app.listen(3000, () =>
  console.log("Server running at http://localhost:3000")
);
