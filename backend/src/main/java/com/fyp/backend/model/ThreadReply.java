package com.fyp.backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "thread_replies", indexes = {
        @Index(name = "idx_thread_replies_thread_id_id", columnList = "thread_id,id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ThreadReply {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(length = 3000)
    private String content;

    // Optional picture attached to the reply: the stored OSS object path.
    @Column
    private String imageUrl;

    // Pending-review shadow flag (see Message.reported). NULL in legacy rows = false.
    @org.hibernate.annotations.ColumnDefault("false")
    private Boolean reported = false;

    private LocalDateTime createdAt = LocalDateTime.now();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id")
    private User author;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "thread_id")
    private Thread thread;
}
