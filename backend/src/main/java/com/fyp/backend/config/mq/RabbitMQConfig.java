package com.fyp.backend.config.mq;

import org.springframework.amqp.core.AnonymousQueue;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.FanoutExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.*;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.retry.RejectAndDontRequeueRecoverer;
import org.springframework.context.annotation.*;
import org.springframework.amqp.rabbit.core.RabbitAdmin;

import com.fyp.backend.mq.FanoutPublisher;

@Configuration
public class RabbitMQConfig {

    @Bean
    public MessageConverter messageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory factory) {
        RabbitTemplate template = new RabbitTemplate(factory);
        template.setMessageConverter(messageConverter());
        return template;
    }

    @Bean
    public RabbitAdmin rabbitAdmin(ConnectionFactory factory) {
        return new RabbitAdmin(factory);
    }

    /**
     * Socket broadcasts fan out to every instance, they are not shared work.
     *
     * Each instance holds WebSocket sessions only for the clients connected to it,
     * so a live message has to reach all of them. A single shared queue would hand
     * each broadcast to exactly one instance and everybody else's clients would
     * silently miss it — correct today on one instance, wrong the moment there are
     * two. The exchange plus a queue per instance is the same behaviour now and the
     * right behaviour later.
     */
    @Bean
    public FanoutExchange broadcastExchange() {
        return new FanoutExchange(FanoutPublisher.BROADCAST_EXCHANGE, true, false);
    }

    /**
     * Anonymous: non-durable, exclusive and auto-deleted with the connection. A
     * broadcast is only meaningful to clients connected right now — anything that
     * piled up while an instance was down would replay as stale "new message"
     * events, and reconnect history already covers what was missed.
     */
    @Bean
    public Queue broadcastQueue() {
        return new AnonymousQueue();
    }

    @Bean
    public Binding broadcastBinding(FanoutExchange broadcastExchange, Queue broadcastQueue) {
        return BindingBuilder.bind(broadcastQueue).to(broadcastExchange);
    }

    /** Push delivery IS shared work: one recipient batch, sent once, by any instance. */
    @Bean
    public Queue pushQueue() {
        return QueueBuilder.durable(FanoutPublisher.PUSH_QUEUE).build();
    }

    /** Answering a mention is shared work too: exactly one instance replies. */
    @Bean
    public Queue assistantQueue() {
        return QueueBuilder.durable(FanoutPublisher.ASSISTANT_QUEUE).build();
    }

    @Bean
    public SimpleRabbitListenerContainerFactory broadcastRabbitListenerContainerFactory(
            ConnectionFactory connectionFactory, MessageConverter messageConverter) {
        return listenerFactory(connectionFactory, messageConverter, 1, 1);
    }

    @Bean
    public SimpleRabbitListenerContainerFactory pushRabbitListenerContainerFactory(
            ConnectionFactory connectionFactory, MessageConverter messageConverter) {
        return listenerFactory(connectionFactory, messageConverter, 2, 4);
    }

    /**
     * The assistant gets its own container, not the push one.
     *
     * Two reasons, both about the fact that an LLM call is slow and billed.
     * Concurrency stays low so a burst of mentions cannot open a dozen paid calls
     * at once. And attempts are ONE: the shared factory retries five times in
     * process, which would turn a single provider timeout into five 30-second
     * calls — about two and a half minutes of a held consumer and five times the
     * cost — and, worse, a handler that posts a reply and then fails would post
     * another on each attempt. AssistantService catches its own errors and answers
     * with a fallback instead, so nothing should reach this advice anyway.
     */
    @Bean
    public SimpleRabbitListenerContainerFactory assistantRabbitListenerContainerFactory(
            ConnectionFactory connectionFactory, MessageConverter messageConverter) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(messageConverter);
        factory.setConcurrentConsumers(1);
        factory.setMaxConcurrentConsumers(2);
        factory.setDefaultRequeueRejected(false);
        factory.setAdviceChain(RetryInterceptorBuilder.stateless()
                .maxAttempts(1)
                .recoverer(new RejectAndDontRequeueRecoverer())
                .build());
        return factory;
    }

    private SimpleRabbitListenerContainerFactory listenerFactory(
            ConnectionFactory connectionFactory, MessageConverter messageConverter,
            int concurrentConsumers, int maxConcurrentConsumers) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(messageConverter);
        factory.setConcurrentConsumers(concurrentConsumers);
        factory.setMaxConcurrentConsumers(maxConcurrentConsumers);
        factory.setDefaultRequeueRejected(false);
        factory.setAdviceChain(RetryInterceptorBuilder.stateless()
                .maxAttempts(5)
                .backOffOptions(1_000L, 2.0, 15_000L)
                .recoverer(new RejectAndDontRequeueRecoverer())
                .build());
        return factory;
    }
}
