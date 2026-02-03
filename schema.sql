create database blog_app_project;
use blog_app_project;
create table users (
    user_id int auto_increment primary key,
    name varchar(100),
    email varchar(100),
    password varchar(100),
    role enum('user','writer','admin') default 'user',
    created_at = timestamp default current_timestamp
);

create table posts(
    post_id int auto_increment primary key,
    user_id int ,
    title varchar(255),
    content text, 
    tags varchar(255),
    status enum('draft','published') default 'draft',
    created_at timestamp default current_timestamp,
    foreign key (user_id) references users(user_id)
);
create table comments(
    comment_id int auto_increment primary key,
    post_id int , 
    user_id int ,
    comment text,
    created_at timestamp default current_timestamp,
    foreign key (post_id) references posts(post_id),
    foreign key (user_id) references users(user_id)
);
